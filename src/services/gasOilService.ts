import { useSyncExternalStore } from "react";
import type { GasOilCountry, GasOilCountryPayload, GasOilSurchargeResult, GasOilSurchargesPayload } from "../types/gasoil";
import { createPollingFeed } from "./tvFeed";

const GASOIL_PATH = "/api/gasoil-surcharges";

function mapResult(value: unknown, country: "NL" | "BE"): GasOilSurchargeResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (row.country !== country) return null;
  // Accept legacy "ready" from older caches during rollout.
  const statusRaw = row.status === "ready" ? "ok" : row.status;
  if (statusRaw !== "ok" && statusRaw !== "stale" && statusRaw !== "unavailable") return null;
  if (typeof row.source !== "string" || typeof row.sourceLabel !== "string") return null;
  const staffel =
    row.staffelRange && typeof row.staffelRange === "object" && !Array.isArray(row.staffelRange)
      ? (row.staffelRange as Record<string, unknown>)
      : null;
  const sourcePrice =
    typeof row.sourcePricePer100Liters === "number"
      ? row.sourcePricePer100Liters
      : typeof row.rawPricePer100LitersCbrb === "number"
        ? row.rawPricePer100LitersCbrb
        : null;
  const sourceType =
    row.sourceType === "automatic" || row.sourceType === "manual-bootstrap" ? row.sourceType : null;
  return {
    country,
    status: statusRaw,
    applicableMonth: typeof row.applicableMonth === "string" ? row.applicableMonth : null,
    referenceDate: typeof row.referenceDate === "string" ? row.referenceDate : null,
    priceExVatPer1000Liters: typeof row.priceExVatPer1000Liters === "number" ? row.priceExVatPer1000Liters : null,
    surchargePerTon: typeof row.surchargePerTon === "number" ? row.surchargePerTon : null,
    staffelRange:
      staffel && typeof staffel.from === "number" && typeof staffel.to === "number"
        ? { from: staffel.from, to: staffel.to }
        : null,
    source: row.source,
    sourceLabel: row.sourceLabel,
    retrievedAt: typeof row.retrievedAt === "string" ? row.retrievedAt : null,
    product:
      typeof row.product === "string"
        ? row.product
        : typeof row.productLabel === "string"
          ? row.productLabel
          : null,
    productLabel:
      typeof row.productLabel === "string"
        ? row.productLabel
        : typeof row.product === "string"
          ? row.product
          : null,
    rawPricePer100LitersCbrb: sourcePrice,
    sourcePricePer100Liters: sourcePrice,
    sourceType,
    sourceNote: typeof row.sourceNote === "string" ? row.sourceNote : null,
    message: typeof row.message === "string" ? row.message : null,
  };
}

function shiftMonth(applicableMonth: string | null) {
  const match = /^(\d{4})-(\d{2})$/.exec(applicableMonth ?? "");
  if (!match) return null;
  const cursor = new Date(Date.UTC(Number(match[1]), Number(match[2]), 1));
  return `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`;
}

function unknownMonth(country: GasOilCountry, applicableMonth: string | null, source: string, sourceLabel: string): GasOilSurchargeResult {
  return {
    country,
    status: "unavailable",
    applicableMonth,
    referenceDate: null,
    priceExVatPer1000Liters: null,
    surchargePerTon: null,
    staffelRange: null,
    source,
    sourceLabel,
    retrievedAt: null,
    product: null,
    productLabel: null,
    rawPricePer100LitersCbrb: null,
    sourcePricePer100Liters: null,
    sourceType: null,
    sourceNote: null,
    message: "Nog niet vastgesteld",
  };
}

function mapCountry(value: unknown, country: GasOilCountry): GasOilCountryPayload | null {
  const current = mapResult(value, country);
  if (!current) return null;
  const row = value as Record<string, unknown>;
  const next =
    mapResult(row.next, country) ??
    unknownMonth(country, shiftMonth(current.applicableMonth), current.source, current.sourceLabel);
  return { ...current, current, next };
}

function mapPayload(payload: unknown): GasOilSurchargesPayload | "empty" {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Gasolietoeslag heeft een ongeldig formaat.");
  }
  const row = payload as Record<string, unknown>;
  if (typeof row.error === "string" && row.error.trim()) throw new Error(row.error);
  const nl = mapCountry(row.nl, "NL");
  const be = mapCountry(row.be, "BE");
  if (!nl || !be) throw new Error("Gasolietoeslag heeft een ongeldig formaat.");
  return {
    nl,
    be,
    fetchedAt: typeof row.fetchedAt === "string" ? row.fetchedAt : new Date().toISOString(),
  };
}

async function loadGasOil(signal: AbortSignal): Promise<GasOilSurchargesPayload | "empty"> {
  const response = await fetch(GASOIL_PATH, { signal });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
        ? payload.error
        : `Gasolietoeslag antwoordde met ${response.status}.`;
    throw new Error(message);
  }
  return mapPayload(payload);
}

function acceptGasOil(value: unknown): GasOilSurchargesPayload | null {
  try {
    const mapped = mapPayload(value);
    return mapped === "empty" ? null : mapped;
  } catch {
    return null;
  }
}

const gasOilFeed = createPollingFeed<GasOilSurchargesPayload>({
  name: "gasolietoeslag",
  storageKey: "teunesen.tv.gasoil.v3",
  unavailable: "Gasolietoeslag niet bereikbaar.",
  load: loadGasOil,
  accept: acceptGasOil,
});

export function useGasOilSurcharges() {
  return useSyncExternalStore(gasOilFeed.subscribe, gasOilFeed.getSnapshot, gasOilFeed.getSnapshot);
}
