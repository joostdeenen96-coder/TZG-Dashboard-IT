import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { dataDir } from "../appPaths.js";
import type { GasOilCountry, GasOilPriceObservation } from "./model.js";

type CacheFile = {
  observation: GasOilPriceObservation;
};

function cachePath(country: GasOilCountry) {
  return path.join(dataDir(), `gasoil-${country.toLowerCase()}.json`);
}

function isObservation(value: unknown): value is GasOilPriceObservation {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return (
    (row.country === "NL" || row.country === "BE") &&
    typeof row.referenceDate === "string" &&
    typeof row.applicableMonth === "string" &&
    typeof row.priceExVatPer1000Liters === "number" &&
    Number.isFinite(row.priceExVatPer1000Liters) &&
    typeof row.source === "string" &&
    typeof row.sourceLabel === "string" &&
    typeof row.retrievedAt === "string"
  );
}

export function readGasOilCache(country: GasOilCountry): GasOilPriceObservation | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(cachePath(country), "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const row = parsed as CacheFile;
    return isObservation(row.observation) ? row.observation : null;
  } catch {
    return null;
  }
}

export function writeGasOilCache(observation: GasOilPriceObservation) {
  const file = cachePath(observation.country);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ observation } satisfies CacheFile));
}
