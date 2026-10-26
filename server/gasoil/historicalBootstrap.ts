/**
 * Historische NL-maandprijzen uit de gepubliceerde brandstofclausule.
 * Alleen de bronprijs per 1000 liter wordt vastgelegd. De toeslag komt uit de bestaande staffel.
 * Teunesen.nl is geen runtimefeed. Nieuwe maanden blijven via Interrijn.
 */
import { logInfo, logWarn } from "../log.js";
import { readGasOilMonthCache, writeGasOilMonthCache, type GasOilMonthCacheEntry } from "./cache.js";
import { readGasOilMonthObservationFromPg, upsertGasOilMonthObservation } from "./pgStore.js";
import { INTERRIJN_SOURCE_ID } from "./providers/netherlandsInterrijnGasOilProvider.js";
import { calculateNetherlandsSurcharge } from "./staffelEngine.js";

export const NL_HISTORICAL_SOURCE_LABEL = "CBRB historische businessreferentie";

export const NL_HISTORICAL_SOURCE_NOTE =
  "Geverifieerd tegen de gepubliceerde brandstofclausule franco leveringen per schip NL. Prijs per 1000 liter ex BTW. Geen runtimeprijsfeed.";

/** Bronprijzen. expectedSurchargePerTon is alleen de stopvoorwaarde, niet de opgeslagen toeslag. */
export const NL_HISTORICAL_BOOTSTRAP = [
  {
    referenceDate: "2026-09-15",
    applicableMonth: "2026-10",
    priceExVatPer1000Liters: 1686.5,
    expectedSurchargePerTon: 2,
  },
  {
    referenceDate: "2026-10-15",
    applicableMonth: "2026-11",
    priceExVatPer1000Liters: 1642.6,
    expectedSurchargePerTon: 1.9,
  },
] as const;

const CONVERSION_NOTE = "prijs per 1000 liter ex BTW; geen €/100L in de historische bron";

export function assertHistoricalStaffel() {
  for (const row of NL_HISTORICAL_BOOTSTRAP) {
    const surcharge = calculateNetherlandsSurcharge(row.priceExVatPer1000Liters);
    if (Math.abs(surcharge - row.expectedSurchargePerTon) > 1e-9) {
      throw new Error(
        `NL-staffel voor ${row.applicableMonth} levert ${surcharge} op bronprijs ${row.priceExVatPer1000Liters}. Verwacht ${row.expectedSurchargePerTon}. Staffel wordt niet aangepast.`,
      );
    }
  }
}

function entryFor(row: (typeof NL_HISTORICAL_BOOTSTRAP)[number]): GasOilMonthCacheEntry {
  return {
    country: "NL",
    referenceDate: row.referenceDate,
    applicableMonth: row.applicableMonth,
    rawSourceValue: row.priceExVatPer1000Liters,
    priceExVatPer1000Liters: row.priceExVatPer1000Liters,
    productIdentifier: "GASOLIEPRIJS (€/1000L ex BTW)",
    source: INTERRIJN_SOURCE_ID,
    retrievedAt: "2026-10-26T00:00:00.000Z",
    sourceLabel: NL_HISTORICAL_SOURCE_LABEL,
    vatStatus: "excl",
    conversionNote: CONVERSION_NOTE,
    surchargePerTon: calculateNetherlandsSurcharge(row.priceExVatPer1000Liters),
    sourceType: "manual-bootstrap",
    sourceNote: NL_HISTORICAL_SOURCE_NOTE,
    publishedPriceUnit: "EUR/1000L",
  };
}

async function existingMonth(applicableMonth: string) {
  const file = readGasOilMonthCache("NL", applicableMonth);
  if (file && file.priceExVatPer1000Liters > 0) return file;
  const fromPg = await readGasOilMonthObservationFromPg("NL", applicableMonth);
  if (fromPg && fromPg.priceExVatPer1000Liters > 0) {
    writeGasOilMonthCache(fromPg);
    return fromPg;
  }
  return null;
}

/** Idempotent. Een bestaande geldige maandobservatie blijft staan. */
export async function ensureNetherlandsHistoricalBootstrap() {
  assertHistoricalStaffel();
  const created: string[] = [];
  const skipped: string[] = [];
  for (const row of NL_HISTORICAL_BOOTSTRAP) {
    const existing = await existingMonth(row.applicableMonth);
    if (existing) {
      skipped.push(row.applicableMonth);
      continue;
    }
    const entry = entryFor(row);
    const wrote = writeGasOilMonthCache(entry);
    if (!wrote) {
      skipped.push(row.applicableMonth);
      continue;
    }
    void upsertGasOilMonthObservation(entry);
    created.push(row.applicableMonth);
  }
  if (created.length) {
    logInfo("gasoil historische NL-bootstrap vastgelegd", { event: "gasoil.historical_bootstrap" });
  }
  return { created, skipped };
}

export function logHistoricalBootstrapFailure(error: unknown) {
  const message = error instanceof Error ? error.message : "historische bootstrap mislukt";
  logWarn(message, { event: "gasoil.historical_bootstrap.failed" });
}
