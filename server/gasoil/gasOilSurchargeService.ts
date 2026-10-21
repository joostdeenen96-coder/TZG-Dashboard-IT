import type {
  GasOilAvailability,
  GasOilCountry,
  GasOilPriceObservation,
  GasOilProviderHealth,
  GasOilSurchargeResult,
  GasOilSurchargesPayload,
} from "./model.js";
import { readGasOilCache, writeGasOilCache } from "./cache.js";
import { currentApplicableMonth, dutchMonthName } from "./monthLogic.js";
import { BelgiumStatbelGasOilProvider } from "./providers/belgiumStatbelGasOilProvider.js";
import type { GasOilFetchOutcome, GasOilPriceProvider } from "./providers/gasOilPriceProvider.js";
import {
  INTERRIJN_SOURCE_LABEL,
  NetherlandsInterrijnGasOilProvider,
} from "./providers/netherlandsInterrijnGasOilProvider.js";
import { STATBEL_SOURCE_LABEL } from "./providers/belgiumStatbelGasOilProvider.js";
import { calculateSurcharge, staffelRangeFor } from "./staffelEngine.js";

export type GasOilServiceDeps = {
  nlProvider?: GasOilPriceProvider;
  beProvider?: GasOilPriceProvider;
  now?: () => Date;
};

function unavailableResult(
  country: GasOilCountry,
  source: GasOilSurchargeResult["source"],
  sourceLabel: string,
  message: string,
): GasOilSurchargeResult {
  return {
    country,
    status: "unavailable",
    applicableMonth: null,
    referenceDate: null,
    priceExVatPer1000Liters: null,
    surchargePerTon: null,
    staffelRange: null,
    source,
    sourceLabel,
    retrievedAt: null,
    productLabel: null,
    message,
  };
}

function resultFromObservation(
  observation: GasOilPriceObservation,
  status: Exclude<GasOilAvailability, "unavailable">,
  message: string | null,
): GasOilSurchargeResult {
  const surchargePerTon = calculateSurcharge(observation.country, observation.priceExVatPer1000Liters);
  return {
    country: observation.country,
    status,
    applicableMonth: observation.applicableMonth,
    referenceDate: observation.referenceDate,
    priceExVatPer1000Liters: observation.priceExVatPer1000Liters,
    surchargePerTon,
    staffelRange: staffelRangeFor(observation.country, observation.priceExVatPer1000Liters),
    source: observation.source,
    sourceLabel: observation.sourceLabel,
    retrievedAt: observation.retrievedAt,
    productLabel: observation.productLabel ?? null,
    message,
  };
}

function observationMatchesApplicableMonth(observation: GasOilPriceObservation, applicableMonth: string) {
  return observation.applicableMonth === applicableMonth;
}

async function resolveCountry(
  provider: GasOilPriceProvider,
  applicableMonth: string,
): Promise<GasOilSurchargeResult> {
  const source = provider.sourceId as GasOilSurchargeResult["source"];
  const sourceLabel = provider.sourceLabel;
  const cached = readGasOilCache(provider.country);
  let outcome: GasOilFetchOutcome;
  try {
    outcome = await provider.getCurrentObservation();
  } catch (error) {
    outcome = { ok: false, reason: error instanceof Error ? error.message : "Bronfout." };
  }

  if (outcome.ok) {
    const observation = outcome.observation;
    if (
      observation.country !== provider.country ||
      !Number.isFinite(observation.priceExVatPer1000Liters) ||
      observation.priceExVatPer1000Liters <= 0
    ) {
      if (cached && observationMatchesApplicableMonth(cached, applicableMonth)) {
        return resultFromObservation(cached, "stale", "Laatste gevalideerde waarde (nieuwe fetch ongeldig).");
      }
      return unavailableResult(provider.country, source, sourceLabel, "Ongeldige bronobservation.");
    }
    writeGasOilCache(observation);
    const status: "ready" | "stale" = observationMatchesApplicableMonth(observation, applicableMonth)
      ? "ready"
      : "stale";
    return resultFromObservation(
      observation,
      status,
      status === "stale" ? "Bronwaarde hoort bij een andere toepassingsmaand." : null,
    );
  }

  if (cached) {
    const status: "stale" = "stale";
    const monthNote = observationMatchesApplicableMonth(cached, applicableMonth)
      ? `Laatst bijgewerkt ${cached.retrievedAt}`
      : `Verouderde cache voor ${dutchMonthName(cached.applicableMonth)}`;
    return resultFromObservation(cached, status, `${monthNote}. ${outcome.reason}`);
  }

  return unavailableResult(provider.country, source, sourceLabel, outcome.reason);
}

export async function getGasOilSurcharges(deps: GasOilServiceDeps = {}): Promise<GasOilSurchargesPayload> {
  const now = deps.now?.() ?? new Date();
  const applicableMonth = currentApplicableMonth(now);
  const nlProvider = deps.nlProvider ?? new NetherlandsInterrijnGasOilProvider();
  const beProvider = deps.beProvider ?? new BelgiumStatbelGasOilProvider();

  const [nl, be] = await Promise.all([
    resolveCountry(nlProvider, applicableMonth),
    resolveCountry(beProvider, applicableMonth),
  ]);

  return {
    nl,
    be,
    fetchedAt: now.toISOString(),
  };
}

export async function getGasOilProviderHealth(deps: GasOilServiceDeps = {}): Promise<GasOilProviderHealth[]> {
  const payload = await getGasOilSurcharges(deps);
  const lastChecked = new Date().toISOString();

  function map(result: GasOilSurchargeResult, id: GasOilProviderHealth["id"], name: string): GasOilProviderHealth {
    if (result.status === "ready") {
      return { id, name, status: "healthy", detail: "actuele toeslag beschikbaar", lastChecked };
    }
    if (result.status === "stale") {
      return { id, name, status: "stale", detail: result.message ?? "verouderde cache", lastChecked };
    }
    return { id, name, status: "unavailable", detail: result.message ?? "niet beschikbaar", lastChecked };
  }

  return [
    map(payload.nl, "interrijnCbrb", INTERRIJN_SOURCE_LABEL),
    map(payload.be, "statbelGasOil", STATBEL_SOURCE_LABEL),
  ];
}
