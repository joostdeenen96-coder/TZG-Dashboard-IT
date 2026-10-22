/**
 * Admin-only handmatige bootstrap voor ontbrekende historische NL peildatums.
 * Admin voert nooit toeslag/ton in — altijd ×10 + staffelengine.
 */
import { writeAudit } from "../audit/repository.js";
import { logInfo } from "../log.js";
import {
  observationToMonthEntry,
  readGasOilMonthCache,
  writeGasOilCache,
  writeGasOilMonthCache,
  type GasOilMonthCacheEntry,
} from "./cache.js";
import { dutchMonthName } from "./monthLogic.js";
import { upsertGasOilMonthObservation } from "./pgStore.js";
import {
  INTERRIJN_PRODUCT,
  INTERRIJN_SOURCE_ID,
  INTERRIJN_SOURCE_LABEL,
  isSaneCbrbPricePer100Liters,
  observationFromCbrbExVat,
  parseEuropeanNumber,
} from "./providers/netherlandsInterrijnGasOilProvider.js";
import { calculateNetherlandsSurcharge, staffelRangeFor } from "./staffelEngine.js";

export type BootstrapPreview = {
  country: "NL";
  referenceDate: string;
  applicableMonth: string;
  applicableMonthLabel: string;
  sourcePricePer100Liters: number;
  priceExVatPer1000Liters: number;
  staffelRange: { from: number; to: number } | null;
  surchargePerTon: number;
  sourceNote: string;
  alreadyExists: boolean;
};

export type BootstrapInput = {
  country: string;
  referenceDate: string;
  pricePer100Liters: number | string;
  sourceNote: string;
  actor?: string;
};

/** Bekende business-acceptance: november 2026 moet €1,90 opleveren. */
const NOVEMBER_2026_EXPECTED_SURCHARGE = 1.9;

function normalizeReferenceDate(raw: string): string | null {
  const trimmed = raw.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dutch = /^(\d{2})-(\d{2})-(\d{4})$/.exec(trimmed);
  if (dutch) return `${dutch[3]}-${dutch[2]}-${dutch[1]}`;
  return null;
}

function parsePrice(value: number | string): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  return parseEuropeanNumber(String(value));
}

export function previewNetherlandsBootstrap(input: BootstrapInput): BootstrapPreview {
  if (input.country !== "NL" && input.country !== "Nederland") {
    throw new Error("Handmatige bootstrap is alleen beschikbaar voor Nederland.");
  }
  const referenceDate = normalizeReferenceDate(input.referenceDate);
  if (!referenceDate) throw new Error("Peildatum is ongeldig. Gebruik JJJJ-MM-DD of DD-MM-JJJJ.");
  if (!/^\d{4}-\d{2}-15$/.test(referenceDate)) {
    throw new Error("Peildatum moet de 15e van de maand zijn.");
  }
  const price = parsePrice(input.pricePer100Liters);
  if (price == null) throw new Error("CBRB-prijs is geen geldig getal.");
  if (!isSaneCbrbPricePer100Liters(price)) {
    throw new Error(`CBRB-prijs buiten plausibele range (€40–€400 / 100L): ${price}`);
  }
  const note = input.sourceNote?.trim() ?? "";
  if (!note) throw new Error("Bronnotitie is verplicht voor audit.");

  const observation = observationFromCbrbExVat({
    pricePer100Liters: price,
    referenceDate,
    retrievedAt: new Date().toISOString(),
    publishedAtLabel: `manual-bootstrap ${referenceDate}`,
  });
  const surchargePerTon = calculateNetherlandsSurcharge(observation.priceExVatPer1000Liters);
  const staffelRange = staffelRangeFor("NL", observation.priceExVatPer1000Liters);
  const existing = readGasOilMonthCache("NL", observation.applicableMonth);

  return {
    country: "NL",
    referenceDate,
    applicableMonth: observation.applicableMonth,
    applicableMonthLabel: dutchMonthName(observation.applicableMonth),
    sourcePricePer100Liters: price,
    priceExVatPer1000Liters: observation.priceExVatPer1000Liters,
    staffelRange,
    surchargePerTon,
    sourceNote: note,
    alreadyExists: Boolean(existing),
  };
}

export async function commitNetherlandsBootstrap(input: BootstrapInput): Promise<GasOilMonthCacheEntry> {
  const preview = previewNetherlandsBootstrap(input);
  if (preview.alreadyExists) {
    throw new Error(
      `Er bestaat al een vastgestelde maandobservatie voor ${preview.applicableMonthLabel}. Overscrijven is niet toegestaan.`,
    );
  }

  // November 2026 business acceptance: toeslag moet €1,90 zijn.
  if (
    preview.applicableMonth === "2026-11" &&
    Math.abs(preview.surchargePerTon - NOVEMBER_2026_EXPECTED_SURCHARGE) > 1e-9
  ) {
    throw new Error(
      `Inconsistentie: peildatum 15-10-2026 levert €${preview.surchargePerTon.toFixed(2)}/ton op, business acceptance is €1,90/ton. Staffel wordt niet aangepast — controleer de CBRB-bronprijs.`,
    );
  }

  const retrievedAt = new Date().toISOString();
  const observation = observationFromCbrbExVat({
    pricePer100Liters: preview.sourcePricePer100Liters,
    referenceDate: preview.referenceDate,
    retrievedAt,
    publishedAtLabel: `manual-bootstrap ${preview.referenceDate}`,
  });
  observation.sourceType = "manual-bootstrap";
  observation.sourceNote = preview.sourceNote;
  observation.conversionNote = `manual-bootstrap; ${preview.sourceNote}; business ex-BTW; €/100L CBRB × 10 → €/1000L`;

  const entry = observationToMonthEntry(observation, {
    rawSourceValue: preview.sourcePricePer100Liters,
    vatStatus: "excl",
    productIdentifier: INTERRIJN_PRODUCT,
    surchargePerTon: preview.surchargePerTon,
    sourceType: "manual-bootstrap",
    sourceNote: preview.sourceNote,
  });

  const wrote = writeGasOilMonthCache(entry);
  if (!wrote) {
    throw new Error("Maandobservatie kon niet worden opgeslagen (mogelijk gelijktijdig vastgelegd).");
  }
  writeGasOilCache(observation);
  void upsertGasOilMonthObservation(entry);

  const actor = input.actor?.trim() || "admin";
  logInfo("gasoil.monthly_observation_manual_created", {
    event: "gasoil.monthly_observation_manual_created",
  });
  await writeAudit({
    action: "gasoil.monthly_observation_manual_created",
    entityType: "gasoil_month_observation",
    entityId: `NL:${preview.applicableMonth}`,
    actor,
    details: {
      country: "NL",
      referenceDate: preview.referenceDate,
      applicableMonth: preview.applicableMonth,
      sourceType: "manual-bootstrap",
      source: INTERRIJN_SOURCE_ID,
      sourceLabel: INTERRIJN_SOURCE_LABEL,
      // Geen credentials; prijs wel auditbaar als businessgegeven
      sourcePricePer100Liters: preview.sourcePricePer100Liters,
      surchargePerTon: preview.surchargePerTon,
    },
  });

  return entry;
}
