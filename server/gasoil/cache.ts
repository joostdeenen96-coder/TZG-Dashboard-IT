import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { dataDir } from "../appPaths.js";
import type { GasOilCountry, GasOilPriceObservation, GasOilSourceId } from "./model.js";

export type GasOilMonthCacheEntry = {
  country: GasOilCountry;
  referenceDate: string;
  applicableMonth: string;
  rawSourceValue: number;
  priceExVatPer1000Liters: number;
  productIdentifier: string;
  source: GasOilSourceId;
  retrievedAt: string;
  sourceLabel: string;
  vatStatus: "excl" | "incl-converted";
  conversionNote?: string;
  surchargePerTon?: number;
};

export type GasOilDayPriceEntry = {
  country: GasOilCountry;
  publishedDate: string;
  pricePer100Liters: number;
  source: GasOilSourceId;
  publishedAtLabel?: string | null;
  retrievedAt: string;
};

type MonthCacheFile = {
  months: Record<string, GasOilMonthCacheEntry>;
};

type DayCacheFile = {
  days: Record<string, GasOilDayPriceEntry>;
};

/** Legacy single-observation cache (NL + backward compat). */
type LegacyCacheFile = {
  observation: GasOilPriceObservation;
};

function legacyCachePath(country: GasOilCountry) {
  return path.join(dataDir(), `gasoil-${country.toLowerCase()}.json`);
}

function monthCachePath(country: GasOilCountry) {
  return path.join(dataDir(), `gasoil-months-${country.toLowerCase()}.json`);
}

function dayCachePath(country: GasOilCountry) {
  return path.join(dataDir(), `gasoil-days-${country.toLowerCase()}.json`);
}

function isFinitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isObservation(value: unknown): value is GasOilPriceObservation {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return (
    (row.country === "NL" || row.country === "BE") &&
    typeof row.referenceDate === "string" &&
    typeof row.applicableMonth === "string" &&
    isFinitePositive(row.priceExVatPer1000Liters) &&
    typeof row.source === "string" &&
    typeof row.sourceLabel === "string" &&
    typeof row.retrievedAt === "string"
  );
}

function isMonthEntry(value: unknown): value is GasOilMonthCacheEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return (
    (row.country === "NL" || row.country === "BE") &&
    typeof row.referenceDate === "string" &&
    typeof row.applicableMonth === "string" &&
    isFinitePositive(row.rawSourceValue) &&
    isFinitePositive(row.priceExVatPer1000Liters) &&
    typeof row.productIdentifier === "string" &&
    typeof row.source === "string" &&
    typeof row.retrievedAt === "string" &&
    typeof row.sourceLabel === "string" &&
    (row.vatStatus === "excl" || row.vatStatus === "incl-converted")
  );
}

function isDayEntry(value: unknown): value is GasOilDayPriceEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return (
    (row.country === "NL" || row.country === "BE") &&
    typeof row.publishedDate === "string" &&
    isFinitePositive(row.pricePer100Liters) &&
    typeof row.source === "string" &&
    typeof row.retrievedAt === "string"
  );
}

function readMonthCacheFile(country: GasOilCountry): MonthCacheFile {
  try {
    const parsed: unknown = JSON.parse(readFileSync(monthCachePath(country), "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { months: {} };
    const months = (parsed as MonthCacheFile).months;
    if (!months || typeof months !== "object" || Array.isArray(months)) return { months: {} };
    const clean: Record<string, GasOilMonthCacheEntry> = {};
    for (const [key, value] of Object.entries(months)) {
      if (isMonthEntry(value) && value.country === country && value.applicableMonth === key) {
        clean[key] = value;
      }
    }
    return { months: clean };
  } catch {
    return { months: {} };
  }
}

function readDayCacheFile(country: GasOilCountry): DayCacheFile {
  try {
    const parsed: unknown = JSON.parse(readFileSync(dayCachePath(country), "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { days: {} };
    const days = (parsed as DayCacheFile).days;
    if (!days || typeof days !== "object" || Array.isArray(days)) return { days: {} };
    const clean: Record<string, GasOilDayPriceEntry> = {};
    for (const [key, value] of Object.entries(days)) {
      if (isDayEntry(value) && value.country === country && value.publishedDate === key) {
        clean[key] = value;
      }
    }
    return { days: clean };
  } catch {
    return { days: {} };
  }
}

export function readGasOilMonthCache(
  country: GasOilCountry,
  applicableMonth: string,
): GasOilMonthCacheEntry | null {
  return readMonthCacheFile(country).months[applicableMonth] ?? null;
}

/**
 * Persist a validated month price. Immutable once written: existing valid months
 * are never overwritten by a later daily Interrijn price.
 */
export function writeGasOilMonthCache(entry: GasOilMonthCacheEntry): boolean {
  if (entry.country !== "NL" && entry.country !== "BE") {
    return false;
  }
  if (!isFinitePositive(entry.priceExVatPer1000Liters) || !isFinitePositive(entry.rawSourceValue)) {
    return false;
  }
  const file = readMonthCacheFile(entry.country);
  const existing = file.months[entry.applicableMonth];
  if (existing && isFinitePositive(existing.priceExVatPer1000Liters)) {
    // Locked month observation — daily refreshes must not change it.
    return false;
  }
  file.months[entry.applicableMonth] = entry;
  const target = monthCachePath(entry.country);
  try {
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, JSON.stringify(file satisfies MonthCacheFile));
    return true;
  } catch {
    return false;
  }
}

export function readGasOilDayPrice(
  country: GasOilCountry,
  publishedDate: string,
): GasOilDayPriceEntry | null {
  return readDayCacheFile(country).days[publishedDate] ?? null;
}

/**
 * Persist a daily Interrijn/CBRB observation. Same publishedDate may refresh
 * with a newer retrievedAt (homepage republishes), but never invents dates.
 */
export function writeGasOilDayPrice(entry: GasOilDayPriceEntry): boolean {
  if (entry.country !== "NL" && entry.country !== "BE") return false;
  if (!isFinitePositive(entry.pricePer100Liters)) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.publishedDate)) return false;
  const file = readDayCacheFile(entry.country);
  file.days[entry.publishedDate] = entry;
  const target = dayCachePath(entry.country);
  try {
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, JSON.stringify(file satisfies DayCacheFile));
    return true;
  } catch {
    return false;
  }
}

export function monthEntryToObservation(entry: GasOilMonthCacheEntry): GasOilPriceObservation {
  return {
    country: entry.country,
    referenceDate: entry.referenceDate,
    applicableMonth: entry.applicableMonth,
    priceExVatPer1000Liters: entry.priceExVatPer1000Liters,
    source: entry.source,
    sourceLabel: entry.sourceLabel,
    retrievedAt: entry.retrievedAt,
    productLabel: entry.productIdentifier,
    rawPriceInclPerLiter: entry.vatStatus === "incl-converted" ? entry.rawSourceValue : undefined,
    rawPricePer100LitersCbrb: entry.country === "NL" ? entry.rawSourceValue : undefined,
    conversionNote: entry.conversionNote,
  };
}

export function observationToMonthEntry(
  observation: GasOilPriceObservation,
  extras: {
    rawSourceValue: number;
    vatStatus: "excl" | "incl-converted";
    productIdentifier: string;
    surchargePerTon?: number;
  },
): GasOilMonthCacheEntry {
  return {
    country: observation.country,
    referenceDate: observation.referenceDate,
    applicableMonth: observation.applicableMonth,
    rawSourceValue: extras.rawSourceValue,
    priceExVatPer1000Liters: observation.priceExVatPer1000Liters,
    productIdentifier: extras.productIdentifier,
    source: observation.source,
    retrievedAt: observation.retrievedAt,
    sourceLabel: observation.sourceLabel,
    vatStatus: extras.vatStatus,
    conversionNote: observation.conversionNote,
    surchargePerTon: extras.surchargePerTon,
  };
}

export function readGasOilCache(country: GasOilCountry): GasOilPriceObservation | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(legacyCachePath(country), "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const row = parsed as LegacyCacheFile;
    return isObservation(row.observation) ? row.observation : null;
  } catch {
    return null;
  }
}

export function writeGasOilCache(observation: GasOilPriceObservation) {
  if (!isFinitePositive(observation.priceExVatPer1000Liters)) return;
  const existing = readGasOilCache(observation.country);
  if (existing && !isFinitePositive(observation.priceExVatPer1000Liters)) return;
  const file = legacyCachePath(observation.country);
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ observation } satisfies LegacyCacheFile));
  } catch {
    // File cache is best-effort when DATA_DIR is not writable.
  }
}
