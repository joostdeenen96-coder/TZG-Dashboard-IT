/**
 * Optional PostgreSQL persistence for gasoil month/day observations.
 * File cache remains the always-on local store; PG is dual-written when DATABASE_URL is set.
 */
import { databaseUrl, getPool } from "../db/pool.js";
import { logWarn } from "../log.js";
import type { GasOilDayPriceEntry, GasOilMonthCacheEntry } from "./cache.js";
import { calculateSurcharge } from "./staffelEngine.js";

function pgEnabled() {
  return Boolean(databaseUrl());
}

function applicableParts(applicableMonth: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(applicableMonth);
  if (!match) return { year: null as number | null, month: null as number | null };
  return { year: Number(match[1]), month: Number(match[2]) };
}

export async function upsertGasOilMonthObservation(entry: GasOilMonthCacheEntry): Promise<boolean> {
  if (!pgEnabled()) return false;
  const surcharge =
    typeof entry.surchargePerTon === "number"
      ? entry.surchargePerTon
      : calculateSurcharge(entry.country, entry.priceExVatPer1000Liters);
  const parts = applicableParts(entry.applicableMonth);
  try {
    await getPool().query(
      `
      INSERT INTO gasoil_month_observations (
        country, applicable_month, reference_date, raw_source_value,
        price_ex_vat_per_1000_liters, surcharge_per_ton, product_identifier,
        source, source_label, vat_status, conversion_note, retrieved_at,
        source_type, source_note, applicable_year, applicable_month_num
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      ON CONFLICT (country, applicable_month) DO NOTHING
      `,
      [
        entry.country,
        entry.applicableMonth,
        entry.referenceDate,
        entry.rawSourceValue,
        entry.priceExVatPer1000Liters,
        surcharge,
        entry.productIdentifier,
        entry.source,
        entry.sourceLabel,
        entry.vatStatus,
        entry.conversionNote ?? null,
        entry.retrievedAt,
        entry.sourceType ?? "automatic",
        entry.sourceNote ?? null,
        parts.year,
        parts.month,
      ],
    );
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "pg month write failed";
    logWarn(`gasoil maandobservatie niet naar postgres: ${message}`);
    return false;
  }
}

export async function upsertGasOilDayPrice(entry: GasOilDayPriceEntry): Promise<boolean> {
  if (!pgEnabled()) return false;
  const priceExVat =
    typeof entry.priceExVatPer1000Liters === "number"
      ? entry.priceExVatPer1000Liters
      : Math.round(entry.pricePer100Liters * 10 * 100) / 100;
  try {
    await getPool().query(
      `
      INSERT INTO gasoil_day_prices (
        country, published_date, price_per_100_liters, source,
        published_at_label, retrieved_at, price_ex_vat_per_1000_liters,
        observed_at, source_url, source_identifier, validation_status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      ON CONFLICT (country, published_date, source) DO UPDATE SET
        price_per_100_liters = EXCLUDED.price_per_100_liters,
        published_at_label = EXCLUDED.published_at_label,
        retrieved_at = EXCLUDED.retrieved_at,
        price_ex_vat_per_1000_liters = EXCLUDED.price_ex_vat_per_1000_liters,
        observed_at = EXCLUDED.observed_at,
        source_url = EXCLUDED.source_url,
        source_identifier = EXCLUDED.source_identifier,
        validation_status = EXCLUDED.validation_status
      `,
      [
        entry.country,
        entry.publishedDate,
        entry.pricePer100Liters,
        entry.source,
        entry.publishedAtLabel ?? null,
        entry.retrievedAt,
        priceExVat,
        entry.observedAt ?? entry.retrievedAt,
        entry.sourceUrl ?? null,
        entry.sourceIdentifier ?? null,
        entry.validationStatus ?? "valid",
      ],
    );
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "pg day write failed";
    logWarn(`gasoil dagprijs niet naar postgres: ${message}`);
    return false;
  }
}

export async function readGasOilMonthObservationFromPg(
  country: "NL" | "BE",
  applicableMonth: string,
): Promise<GasOilMonthCacheEntry | null> {
  if (!pgEnabled()) return null;
  try {
    const result = await getPool().query<{
      country: "NL" | "BE";
      applicable_month: string;
      reference_date: string | Date;
      raw_source_value: string;
      price_ex_vat_per_1000_liters: string;
      surcharge_per_ton: string | null;
      product_identifier: string;
      source: string;
      source_label: string;
      vat_status: "excl" | "incl-converted";
      conversion_note: string | null;
      retrieved_at: string | Date;
      source_type: "automatic" | "manual-bootstrap" | null;
      source_note: string | null;
    }>(
      `
      SELECT country, applicable_month, reference_date, raw_source_value,
             price_ex_vat_per_1000_liters, surcharge_per_ton, product_identifier,
             source, source_label, vat_status, conversion_note, retrieved_at,
             source_type, source_note
      FROM gasoil_month_observations
      WHERE country = $1 AND applicable_month = $2
      `,
      [country, applicableMonth],
    );
    const row = result.rows[0];
    if (!row) return null;
    const referenceDate =
      typeof row.reference_date === "string"
        ? row.reference_date.slice(0, 10)
        : row.reference_date.toISOString().slice(0, 10);
    const retrievedAt =
      typeof row.retrieved_at === "string" ? row.retrieved_at : row.retrieved_at.toISOString();
    return {
      country: row.country,
      applicableMonth: row.applicable_month,
      referenceDate,
      rawSourceValue: Number(row.raw_source_value),
      priceExVatPer1000Liters: Number(row.price_ex_vat_per_1000_liters),
      surchargePerTon: row.surcharge_per_ton != null ? Number(row.surcharge_per_ton) : undefined,
      productIdentifier: row.product_identifier,
      source: row.source as GasOilMonthCacheEntry["source"],
      sourceLabel: row.source_label,
      vatStatus: row.vat_status,
      conversionNote: row.conversion_note ?? undefined,
      retrievedAt,
      sourceType: row.source_type ?? "automatic",
      sourceNote: row.source_note ?? undefined,
    };
  } catch {
    return null;
  }
}

export async function readGasOilDayPriceFromPg(
  country: "NL" | "BE",
  publishedDate: string,
  source = "interrijn-cbrb-kbn",
): Promise<GasOilDayPriceEntry | null> {
  if (!pgEnabled()) return null;
  try {
    const result = await getPool().query<{
      country: "NL" | "BE";
      published_date: string | Date;
      price_per_100_liters: string;
      price_ex_vat_per_1000_liters: string | null;
      source: string;
      published_at_label: string | null;
      retrieved_at: string | Date;
      observed_at: string | Date | null;
      source_url: string | null;
      source_identifier: string | null;
      validation_status: "valid" | "invalid" | null;
    }>(
      `
      SELECT country, published_date, price_per_100_liters, price_ex_vat_per_1000_liters,
             source, published_at_label, retrieved_at, observed_at, source_url,
             source_identifier, validation_status
      FROM gasoil_day_prices
      WHERE country = $1 AND published_date = $2 AND source = $3
      `,
      [country, publishedDate, source],
    );
    const row = result.rows[0];
    if (!row) return null;
    const published =
      typeof row.published_date === "string"
        ? row.published_date.slice(0, 10)
        : row.published_date.toISOString().slice(0, 10);
    const retrievedAt =
      typeof row.retrieved_at === "string" ? row.retrieved_at : row.retrieved_at.toISOString();
    const observedAt =
      row.observed_at == null
        ? retrievedAt
        : typeof row.observed_at === "string"
          ? row.observed_at
          : row.observed_at.toISOString();
    return {
      country: row.country,
      publishedDate: published,
      pricePer100Liters: Number(row.price_per_100_liters),
      priceExVatPer1000Liters:
        row.price_ex_vat_per_1000_liters != null
          ? Number(row.price_ex_vat_per_1000_liters)
          : Math.round(Number(row.price_per_100_liters) * 10 * 100) / 100,
      source: row.source as GasOilDayPriceEntry["source"],
      publishedAtLabel: row.published_at_label,
      retrievedAt,
      observedAt,
      sourceUrl: row.source_url ?? undefined,
      sourceIdentifier: row.source_identifier ?? undefined,
      validationStatus: row.validation_status ?? "valid",
    };
  } catch {
    return null;
  }
}
