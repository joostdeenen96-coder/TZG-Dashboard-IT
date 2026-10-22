import type {
  GasOilAvailability,
  GasOilBeDiagnostics,
  GasOilCountry,
  GasOilPriceObservation,
  GasOilProviderHealth,
  GasOilSurchargeResult,
  GasOilSurchargesPayload,
} from "./model.js";
import {
  monthEntryToObservation,
  observationToMonthEntry,
  readGasOilCache,
  readGasOilMonthCache,
  writeGasOilCache,
  writeGasOilMonthCache,
  type GasOilMonthCacheEntry,
} from "./cache.js";
import {
  currentApplicableMonth,
  currentApplicableMonthNetherlands,
  dutchMonthName,
  formatIsoDate,
  formatYearMonth,
  referenceDateForApplicableMonth,
} from "./monthLogic.js";
import {
  readGasOilMonthObservationFromPg,
  upsertGasOilMonthObservation,
} from "./pgStore.js";
import {
  BELGIUM_PRODUCT_IDENTIFIER,
  BELGIUM_UNIT,
  BelgiumStatbelGasOilProvider,
  STATBEL_DAY_JSON,
  STATBEL_HISTORY_JSON,
  STATBEL_SOURCE_LABEL,
  belgiumVatDivisor,
} from "./providers/belgiumStatbelGasOilProvider.js";
import type { GasOilFetchOutcome, GasOilPriceProvider } from "./providers/gasOilPriceProvider.js";
import {
  INTERRIJN_SOURCE_LABEL,
  NetherlandsInterrijnGasOilProvider,
} from "./providers/netherlandsInterrijnGasOilProvider.js";
import { calculateSurcharge, staffelRangeFor } from "./staffelEngine.js";

export type GasOilServiceDeps = {
  nlProvider?: GasOilPriceProvider | NetherlandsInterrijnGasOilProvider;
  beProvider?: GasOilPriceProvider | BelgiumStatbelGasOilProvider;
  now?: () => Date;
  /** Force network fetch even when month cache exists (tests). */
  forceRefresh?: boolean;
};

function amsterdamParts(now: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Amsterdam",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
  };
}

function nextApplicableMonth(applicableMonth: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(applicableMonth);
  if (!match) throw new Error(`Ongeldige toepassingsmaand: ${applicableMonth}`);
  let year = Number(match[1]);
  let month = Number(match[2]) + 1;
  if (month > 12) {
    month = 1;
    year += 1;
  }
  return formatYearMonth(year, month);
}

function diagnosticsEnabled() {
  if (process.env.GASOIL_DIAGNOSTICS === "1") return true;
  return (process.env.NODE_ENV || "development") !== "production";
}

function sourcePricePer100(observation: GasOilPriceObservation): number | null {
  if (typeof observation.rawPricePer100LitersCbrb === "number") {
    return observation.rawPricePer100LitersCbrb;
  }
  if (observation.country === "NL" && Number.isFinite(observation.priceExVatPer1000Liters)) {
    return Math.round((observation.priceExVatPer1000Liters / 10) * 100) / 100;
  }
  return null;
}

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
    product: null,
    productLabel: null,
    rawPricePer100LitersCbrb: null,
    sourcePricePer100Liters: null,
    message,
  };
}

function resultFromObservation(
  observation: GasOilPriceObservation,
  status: Exclude<GasOilAvailability, "unavailable">,
  message: string | null,
): GasOilSurchargeResult {
  const surchargePerTon = calculateSurcharge(observation.country, observation.priceExVatPer1000Liters);
  const product = observation.productLabel ?? null;
  const sourcePrice = sourcePricePer100(observation);
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
    product,
    productLabel: product,
    rawPricePer100LitersCbrb: sourcePrice,
    sourcePricePer100Liters: sourcePrice,
    message,
  };
}

function observationMatchesApplicableMonth(observation: GasOilPriceObservation, applicableMonth: string) {
  return observation.applicableMonth === applicableMonth;
}

function isBelgiumProvider(
  provider: GasOilPriceProvider | BelgiumStatbelGasOilProvider,
): provider is BelgiumStatbelGasOilProvider {
  return provider instanceof BelgiumStatbelGasOilProvider;
}

function isNetherlandsProvider(
  provider: GasOilPriceProvider | NetherlandsInterrijnGasOilProvider,
): provider is NetherlandsInterrijnGasOilProvider {
  return provider instanceof NetherlandsInterrijnGasOilProvider;
}

async function loadMonthEntry(
  country: GasOilCountry,
  applicableMonth: string,
): Promise<GasOilMonthCacheEntry | null> {
  const file = readGasOilMonthCache(country, applicableMonth);
  if (file) return file;
  const fromPg = await readGasOilMonthObservationFromPg(country, applicableMonth);
  if (fromPg) {
    // Hydrate file cache from PG without treating as a new lock write race.
    writeGasOilMonthCache(fromPg);
    return fromPg;
  }
  return null;
}

async function persistMonthObservation(
  observation: GasOilPriceObservation,
  extras: {
    rawSourceValue: number;
    vatStatus: "excl" | "incl-converted";
    productIdentifier: string;
  },
): Promise<GasOilMonthCacheEntry> {
  const surchargePerTon = calculateSurcharge(observation.country, observation.priceExVatPer1000Liters);
  const entry = observationToMonthEntry(observation, { ...extras, surchargePerTon });
  const wrote = writeGasOilMonthCache(entry);
  if (wrote) {
    void upsertGasOilMonthObservation(entry);
    return entry;
  }
  // Month already locked — return the immutable stored value.
  const locked = readGasOilMonthCache(observation.country, observation.applicableMonth);
  return locked ?? entry;
}

async function fetchAndCacheNetherlandsMonth(
  provider: NetherlandsInterrijnGasOilProvider,
  applicableMonth: string,
): Promise<{ result: GasOilSurchargeResult | null; reason: string | null }> {
  const monthCached = await loadMonthEntry("NL", applicableMonth);
  const outcome = await provider.getObservationForApplicableMonth(applicableMonth);

  if (outcome.ok) {
    const { observation, rawSourceValue } = outcome;
    if (
      observation.country !== "NL" ||
      !Number.isFinite(observation.priceExVatPer1000Liters) ||
      observation.priceExVatPer1000Liters <= 0
    ) {
      if (monthCached) {
        return {
          result: resultFromObservation(
            monthEntryToObservation(monthCached),
            "stale",
            "Laatste gevalideerde maandwaarde (nieuwe fetch ongeldig).",
          ),
          reason: "Ongeldige bronobservation.",
        };
      }
      return {
        result: unavailableResult("NL", "interrijn-cbrb-kbn", INTERRIJN_SOURCE_LABEL, "Ongeldige bronobservation."),
        reason: "Ongeldige bronobservation.",
      };
    }

    if (monthCached) {
      // NL15: dagelijkse/nieuwe peiling overschrijft vastgestelde maand niet.
      return {
        result: resultFromObservation(monthEntryToObservation(monthCached), "ok", null),
        reason: null,
      };
    }

    const stored = await persistMonthObservation(observation, {
      rawSourceValue,
      vatStatus: "excl",
      productIdentifier: observation.productLabel ?? "GASOLIEPRIJS (€/100L CBRB)",
    });
    writeGasOilCache(monthEntryToObservation(stored));
    return {
      result: resultFromObservation(monthEntryToObservation(stored), "ok", null),
      reason: null,
    };
  }

  if (monthCached) {
    return {
      result: resultFromObservation(
        monthEntryToObservation(monthCached),
        "stale",
        `Maandcache ${applicableMonth}. ${outcome.reason}`,
      ),
      reason: outcome.reason,
    };
  }

  return { result: null, reason: outcome.reason };
}

async function resolveNetherlands(
  provider: GasOilPriceProvider | NetherlandsInterrijnGasOilProvider,
  applicableMonth: string,
  options: { forceRefresh: boolean; now: Date },
): Promise<GasOilSurchargeResult> {
  const source = "interrijn-cbrb-kbn" as const;
  const sourceLabel = provider.sourceLabel || INTERRIJN_SOURCE_LABEL;

  const monthCached = await loadMonthEntry("NL", applicableMonth);
  if (monthCached && !options.forceRefresh) {
    return resultFromObservation(monthEntryToObservation(monthCached), "ok", null);
  }

  if (isNetherlandsProvider(provider)) {
    const { result, reason } = await fetchAndCacheNetherlandsMonth(provider, applicableMonth);
    if (result) return result;
    return unavailableResult(
      "NL",
      source,
      sourceLabel,
      reason ?? "Interrijn peildatum niet gevonden. Geen fallback op dagprijs.",
    );
  }

  // Generic mock providers (tests)
  const cached = readGasOilCache("NL");
  let outcome: GasOilFetchOutcome;
  try {
    outcome = await provider.getCurrentObservation();
  } catch (error) {
    outcome = { ok: false, reason: error instanceof Error ? error.message : "Bronfout." };
  }

  if (outcome.ok) {
    const observation = outcome.observation;
    if (
      observation.country !== "NL" ||
      !Number.isFinite(observation.priceExVatPer1000Liters) ||
      observation.priceExVatPer1000Liters <= 0
    ) {
      if (cached && observationMatchesApplicableMonth(cached, applicableMonth)) {
        return resultFromObservation(cached, "stale", "Laatste gevalideerde waarde (nieuwe fetch ongeldig).");
      }
      return unavailableResult("NL", source, sourceLabel, "Ongeldige bronobservation.");
    }
    if (monthCached) {
      return resultFromObservation(monthEntryToObservation(monthCached), "ok", null);
    }
    const stored = await persistMonthObservation(observation, {
      rawSourceValue: observation.rawPricePer100LitersCbrb ?? observation.priceExVatPer1000Liters / 10,
      vatStatus: "excl",
      productIdentifier: observation.productLabel ?? "GASOLIEPRIJS (€/100L CBRB)",
    });
    writeGasOilCache(monthEntryToObservation(stored));
    return resultFromObservation(monthEntryToObservation(stored), "ok", null);
  }

  if (monthCached) {
    return resultFromObservation(
      monthEntryToObservation(monthCached),
      "stale",
      `Maandcache. ${outcome.reason}`,
    );
  }
  if (cached) {
    const monthNote = observationMatchesApplicableMonth(cached, applicableMonth)
      ? `Laatst bijgewerkt ${cached.retrievedAt}`
      : `Verouderde cache voor ${dutchMonthName(cached.applicableMonth)}`;
    return resultFromObservation(cached, "stale", `${monthNote}. ${outcome.reason}`);
  }

  return unavailableResult("NL", source, sourceLabel, outcome.reason);
}

async function fetchAndCacheBelgiumMonth(
  provider: BelgiumStatbelGasOilProvider,
  applicableMonth: string,
): Promise<{
  result: GasOilSurchargeResult | null;
  diagnostics: GasOilBeDiagnostics;
  reason: string | null;
}> {
  const monthCached = await loadMonthEntry("BE", applicableMonth);
  const outcome = await provider.getObservationForApplicableMonth(applicableMonth);
  const baseDiag: GasOilBeDiagnostics = {
    referenceDate: referenceDateForApplicableMonth(applicableMonth),
    applicableMonth,
    productIdentifier: BELGIUM_PRODUCT_IDENTIFIER,
    unit: BELGIUM_UNIT,
    vatStatus: "unavailable",
    vatDivisor: belgiumVatDivisor(),
    sourceRecord: null,
    cacheHit: false,
    historyEndpoint: STATBEL_HISTORY_JSON,
    dayEndpoint: STATBEL_DAY_JSON,
  };

  if (outcome.ok) {
    const { observation, diagnostics, rawSourceValue, vatStatus } = outcome;
    if (
      observation.country !== "BE" ||
      !Number.isFinite(observation.priceExVatPer1000Liters) ||
      observation.priceExVatPer1000Liters <= 0
    ) {
      if (monthCached) {
        return {
          result: resultFromObservation(
            monthEntryToObservation(monthCached),
            "stale",
            "Laatste gevalideerde maandwaarde (nieuwe fetch ongeldig).",
          ),
          diagnostics: {
            ...baseDiag,
            vatStatus: "cache",
            vatDivisor: null,
            cacheHit: true,
            sourceRecord: null,
          },
          reason: "Ongeldige bronobservation.",
        };
      }
      return {
        result: unavailableResult("BE", "bestat-statbel", STATBEL_SOURCE_LABEL, "Ongeldige bronobservation."),
        diagnostics: { ...baseDiag, ...diagnostics, vatStatus: "unavailable", cacheHit: false },
        reason: "Ongeldige bronobservation.",
      };
    }

    if (monthCached) {
      return {
        result: resultFromObservation(monthEntryToObservation(monthCached), "ok", null),
        diagnostics: {
          ...baseDiag,
          referenceDate: monthCached.referenceDate,
          vatStatus: "cache",
          vatDivisor: null,
          cacheHit: true,
        },
        reason: null,
      };
    }

    const stored = await persistMonthObservation(observation, {
      rawSourceValue,
      vatStatus,
      productIdentifier: BELGIUM_PRODUCT_IDENTIFIER,
    });
    writeGasOilCache(monthEntryToObservation(stored));

    const status: "ok" | "stale" = observationMatchesApplicableMonth(observation, applicableMonth)
      ? "ok"
      : "stale";
    return {
      result: resultFromObservation(
        monthEntryToObservation(stored),
        status,
        status === "stale" ? "Bronwaarde hoort bij een andere toepassingsmaand." : null,
      ),
      diagnostics: {
        referenceDate: diagnostics.referenceDate,
        applicableMonth: diagnostics.applicableMonth,
        productIdentifier: diagnostics.productIdentifier,
        unit: diagnostics.unit,
        vatStatus: diagnostics.vatStatus,
        vatDivisor: diagnostics.vatDivisor,
        sourceRecord: diagnostics.sourceRecord,
        cacheHit: false,
        historyEndpoint: diagnostics.historyEndpoint,
        dayEndpoint: diagnostics.dayEndpoint,
      },
      reason: null,
    };
  }

  if (monthCached) {
    return {
      result: resultFromObservation(
        monthEntryToObservation(monthCached),
        "stale",
        `Maandcache ${applicableMonth}. ${outcome.reason}`,
      ),
      diagnostics: {
        ...baseDiag,
        referenceDate: monthCached.referenceDate,
        vatStatus: "cache",
        vatDivisor: null,
        cacheHit: true,
      },
      reason: outcome.reason,
    };
  }

  return {
    result: null,
    diagnostics: {
      ...baseDiag,
      vatStatus: "unavailable",
      sourceRecord: outcome.diagnostics?.sourceRecord ?? null,
      cacheHit: false,
    },
    reason: outcome.reason,
  };
}

async function resolveBelgium(
  provider: GasOilPriceProvider | BelgiumStatbelGasOilProvider,
  applicableMonth: string,
  options: { forceRefresh: boolean; now: Date },
): Promise<{ result: GasOilSurchargeResult; diagnostics: GasOilBeDiagnostics }> {
  const source = "bestat-statbel" as const;
  const sourceLabel = provider.sourceLabel || STATBEL_SOURCE_LABEL;

  const monthCached = await loadMonthEntry("BE", applicableMonth);
  if (monthCached && !options.forceRefresh) {
    const diagnostics: GasOilBeDiagnostics = {
      referenceDate: monthCached.referenceDate,
      applicableMonth: monthCached.applicableMonth,
      productIdentifier: monthCached.productIdentifier,
      unit: BELGIUM_UNIT,
      vatStatus: "cache",
      vatDivisor: null,
      sourceRecord: null,
      cacheHit: true,
      historyEndpoint: STATBEL_HISTORY_JSON,
      dayEndpoint: STATBEL_DAY_JSON,
    };
    return {
      result: resultFromObservation(monthEntryToObservation(monthCached), "ok", null),
      diagnostics,
    };
  }

  if (isBelgiumProvider(provider)) {
    const { result, diagnostics, reason } = await fetchAndCacheBelgiumMonth(provider, applicableMonth);
    if (result) return { result, diagnostics };

    return {
      result: unavailableResult(
        "BE",
        source,
        sourceLabel,
        reason ?? "be.STAT peildatum niet gevonden. Geen fallback.",
      ),
      diagnostics,
    };
  }

  // Generic provider fallback (tests with mocks).
  const cached = readGasOilCache("BE");
  let outcome: GasOilFetchOutcome;
  try {
    outcome = await provider.getCurrentObservation();
  } catch (error) {
    outcome = { ok: false, reason: error instanceof Error ? error.message : "Bronfout." };
  }
  const diagnostics: GasOilBeDiagnostics = {
    referenceDate: referenceDateForApplicableMonth(applicableMonth),
    applicableMonth,
    productIdentifier: BELGIUM_PRODUCT_IDENTIFIER,
    unit: BELGIUM_UNIT,
    vatStatus: "unavailable",
    vatDivisor: belgiumVatDivisor(),
    sourceRecord: null,
    cacheHit: false,
    historyEndpoint: STATBEL_HISTORY_JSON,
    dayEndpoint: STATBEL_DAY_JSON,
  };

  if (outcome.ok) {
    const observation = outcome.observation;
    if (
      !Number.isFinite(observation.priceExVatPer1000Liters) ||
      observation.priceExVatPer1000Liters <= 0
    ) {
      if (cached && observationMatchesApplicableMonth(cached, applicableMonth)) {
        return {
          result: resultFromObservation(cached, "stale", "Laatste gevalideerde waarde (nieuwe fetch ongeldig)."),
          diagnostics: { ...diagnostics, vatStatus: "cache", cacheHit: true },
        };
      }
      return {
        result: unavailableResult("BE", source, sourceLabel, "Ongeldige bronobservation."),
        diagnostics,
      };
    }
    if (monthCached) {
      return {
        result: resultFromObservation(monthEntryToObservation(monthCached), "ok", null),
        diagnostics: { ...diagnostics, vatStatus: "cache", cacheHit: true, referenceDate: monthCached.referenceDate },
      };
    }
    const stored = await persistMonthObservation(observation, {
      rawSourceValue: observation.rawPriceInclPerLiter ?? observation.priceExVatPer1000Liters,
      vatStatus: observation.rawPriceInclPerLiter != null ? "incl-converted" : "excl",
      productIdentifier: observation.productLabel ?? BELGIUM_PRODUCT_IDENTIFIER,
    });
    writeGasOilCache(monthEntryToObservation(stored));
    return {
      result: resultFromObservation(monthEntryToObservation(stored), "ok", null),
      diagnostics: {
        ...diagnostics,
        referenceDate: observation.referenceDate,
        applicableMonth: observation.applicableMonth,
        vatStatus: observation.rawPriceInclPerLiter != null ? "incl-converted" : "excl",
        productIdentifier: observation.productLabel ?? BELGIUM_PRODUCT_IDENTIFIER,
      },
    };
  }

  if (monthCached) {
    return {
      result: resultFromObservation(
        monthEntryToObservation(monthCached),
        "stale",
        `Maandcache. ${outcome.reason}`,
      ),
      diagnostics: { ...diagnostics, vatStatus: "cache", cacheHit: true, referenceDate: monthCached.referenceDate },
    };
  }
  if (cached) {
    return {
      result: resultFromObservation(cached, "stale", outcome.reason),
      diagnostics: { ...diagnostics, vatStatus: "cache", cacheHit: true },
    };
  }
  return {
    result: unavailableResult("BE", source, sourceLabel, outcome.reason),
    diagnostics,
  };
}

export async function getGasOilSurcharges(deps: GasOilServiceDeps = {}): Promise<GasOilSurchargesPayload> {
  const now = deps.now?.() ?? new Date();
  // BE: kalendermaand. NL: vanaf 15e → volgende toepassingsmaand.
  const beApplicableMonth = currentApplicableMonth(now);
  const nlApplicableMonth = currentApplicableMonthNetherlands(now);
  const nlProvider = deps.nlProvider ?? new NetherlandsInterrijnGasOilProvider({ now: deps.now });
  const beProvider = deps.beProvider ?? new BelgiumStatbelGasOilProvider({ now: deps.now });
  const forceRefresh = deps.forceRefresh === true;

  const [nl, beResolved] = await Promise.all([
    resolveNetherlands(nlProvider, nlApplicableMonth, { forceRefresh, now }),
    resolveBelgium(beProvider, beApplicableMonth, { forceRefresh, now }),
  ]);

  // Prefetch next month when its peildatum is already available.
  const today = amsterdamParts(now);
  const todayIso = formatIsoDate(today.year, today.month, today.day);
  const upcomingBe = nextApplicableMonth(beApplicableMonth);
  const upcomingNl = nextApplicableMonth(nlApplicableMonth);
  const upcomingBeRef = referenceDateForApplicableMonth(upcomingBe);
  const upcomingNlRef = referenceDateForApplicableMonth(upcomingNl);
  if (upcomingBeRef <= todayIso) {
    if (isBelgiumProvider(beProvider) && (forceRefresh || !(await loadMonthEntry("BE", upcomingBe)))) {
      try {
        await fetchAndCacheBelgiumMonth(beProvider, upcomingBe);
      } catch {
        // Prefetch is best-effort.
      }
    }
  }
  if (upcomingNlRef <= todayIso) {
    if (isNetherlandsProvider(nlProvider) && (forceRefresh || !(await loadMonthEntry("NL", upcomingNl)))) {
      try {
        await fetchAndCacheNetherlandsMonth(nlProvider, upcomingNl);
      } catch {
        // Prefetch is best-effort.
      }
    }
  }

  const payload: GasOilSurchargesPayload = {
    nl,
    be: beResolved.result,
    fetchedAt: now.toISOString(),
  };

  if (diagnosticsEnabled()) {
    payload.diagnostics = { be: beResolved.diagnostics };
  }

  return payload;
}

export async function getGasOilProviderHealth(deps: GasOilServiceDeps = {}): Promise<GasOilProviderHealth[]> {
  const payload = await getGasOilSurcharges(deps);
  const lastChecked = new Date().toISOString();

  function map(result: GasOilSurchargeResult, id: GasOilProviderHealth["id"], name: string): GasOilProviderHealth {
    if (result.status === "ok") {
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
