/**
 * Server-side dagelijkse Interrijn CBRB-capture + automatische maandvastlegging op de 15e.
 * Geen browser; gebruikt bestaande HTTP-fetch.
 */
import { logInfo, logWarn } from "../log.js";
import {
  readGasOilDayPrice,
  readGasOilMonthCache,
  writeGasOilDayPrice,
  writeGasOilMonthCache,
  type GasOilMonthCacheEntry,
} from "./cache.js";
import { applicableMonthFromReferenceDate, amsterdamCalendarDate } from "./monthLogic.js";
import { upsertGasOilDayPrice, upsertGasOilMonthObservation } from "./pgStore.js";
import {
  INTERRIJN_PRODUCT,
  INTERRIJN_SOURCE_ID,
  INTERRIJN_SOURCE_LABEL,
  INTERRIJN_URL,
  cbrbPer100ToPer1000,
  interrijnCbrbVatStatus,
  isSaneCbrbPricePer100Liters,
  observationFromCbrbExVat,
  parseInterrijnGasolieSection,
} from "./providers/netherlandsInterrijnGasOilProvider.js";
import { calculateNetherlandsSurcharge } from "./staffelEngine.js";

export type DailyCaptureResult =
  | {
      status: "success";
      observationDate: string;
      sourcePricePer100Liters: number;
      monthLocked: boolean;
      applicableMonth: string | null;
    }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string };

let captureInFlight: Promise<DailyCaptureResult> | null = null;
let schedulerStarted = false;
let lastCaptureAt: string | null = null;
let lastCaptureResult: DailyCaptureResult | null = null;

function isFifteenth(isoDate: string) {
  return /^\d{4}-\d{2}-15$/.test(isoDate);
}

async function persistDayAndMaybeMonth(options: {
  pricePer100Liters: number;
  observationDate: string;
  publishedAtLabel: string | null;
  retrievedAt: string;
}): Promise<DailyCaptureResult> {
  const priceExVat = cbrbPer100ToPer1000(options.pricePer100Liters);
  const dayEntry = {
    country: "NL" as const,
    publishedDate: options.observationDate,
    pricePer100Liters: options.pricePer100Liters,
    priceExVatPer1000Liters: priceExVat,
    source: INTERRIJN_SOURCE_ID,
    publishedAtLabel: options.publishedAtLabel,
    observedAt: options.retrievedAt,
    sourceUrl: INTERRIJN_URL,
    sourceIdentifier: INTERRIJN_PRODUCT,
    validationStatus: "valid" as const,
    retrievedAt: options.retrievedAt,
  };

  const previous = readGasOilDayPrice("NL", options.observationDate);
  writeGasOilDayPrice(dayEntry);
  void upsertGasOilDayPrice(dayEntry);

  let monthLocked = false;
  let applicableMonth: string | null = null;

  if (isFifteenth(options.observationDate)) {
    applicableMonth = applicableMonthFromReferenceDate(options.observationDate);
    const existing = readGasOilMonthCache("NL", applicableMonth);
    if (existing) {
      logInfo("gasoil capture maand peiling overgeslagen (reeds vastgelegd)", {
        event: "gasoil.capture.month_skipped",
      });
    } else {
      const observation = observationFromCbrbExVat({
        pricePer100Liters: options.pricePer100Liters,
        referenceDate: options.observationDate,
        retrievedAt: options.retrievedAt,
        publishedAtLabel: options.publishedAtLabel,
      });
      const surchargePerTon = calculateNetherlandsSurcharge(observation.priceExVatPer1000Liters);
      const monthEntry: GasOilMonthCacheEntry = {
        country: "NL",
        referenceDate: options.observationDate,
        applicableMonth,
        rawSourceValue: options.pricePer100Liters,
        priceExVatPer1000Liters: observation.priceExVatPer1000Liters,
        productIdentifier: INTERRIJN_PRODUCT,
        source: INTERRIJN_SOURCE_ID,
        retrievedAt: options.retrievedAt,
        sourceLabel: INTERRIJN_SOURCE_LABEL,
        vatStatus: "excl",
        conversionNote: observation.conversionNote,
        surchargePerTon,
        sourceType: "automatic",
      };
      const wrote = writeGasOilMonthCache(monthEntry);
      if (wrote) {
        void upsertGasOilMonthObservation(monthEntry);
        monthLocked = true;
        logInfo(`gasoil maand peiling vastgelegd ${applicableMonth}`, {
          event: "gasoil.capture.month_locked",
        });
      }
    }
  }

  if (
    previous &&
    previous.pricePer100Liters === options.pricePer100Liters &&
    previous.publishedDate === options.observationDate
  ) {
    logInfo("gasoil capture succesvol (idempotent update)", { event: "gasoil.capture.success" });
  } else {
    logInfo("gasoil capture succesvol", { event: "gasoil.capture.success" });
  }

  return {
    status: "success",
    observationDate: options.observationDate,
    sourcePricePer100Liters: options.pricePer100Liters,
    monthLocked,
    applicableMonth,
  };
}

export async function runNetherlandsDailyCapture(deps: {
  fetchText?: (url: string) => Promise<string>;
  now?: () => Date;
} = {}): Promise<DailyCaptureResult> {
  if (captureInFlight) {
    logInfo("gasoil capture overgeslagen (reeds bezig)", { event: "gasoil.capture.skipped" });
    return { status: "skipped", reason: "Capture reeds bezig." };
  }

  captureInFlight = (async () => {
    logInfo("gasoil capture gestart", { event: "gasoil.capture.started" });
    const now = deps.now?.() ?? new Date();
    const retrievedAt = now.toISOString();

    if (interrijnCbrbVatStatus() !== "ex-vat") {
      const reason = "CBRB VAT-status is niet ex-vat; capture geweigerd.";
      logWarn(reason, { event: "gasoil.capture.failed" });
      return { status: "failed", reason };
    }

    try {
      const fetchText =
        deps.fetchText ??
        (async (url: string) => {
          const { fetchBytes } = await import("../providers/http.js");
          const bytes = await fetchBytes(url);
          return new TextDecoder("utf-8").decode(bytes);
        });

      const html = await fetchText(INTERRIJN_URL);
      const parsed = parseInterrijnGasolieSection(html);
      if (!parsed.ok) {
        logWarn(`gasoil capture mislukt: ${parsed.reason}`, { event: "gasoil.capture.failed" });
        return { status: "failed", reason: parsed.reason };
      }
      if (!parsed.parsed.publishedAtIso) {
        const reason = "Publicatiedatum ontbreekt op Interrijn-homepage.";
        logWarn(`gasoil capture mislukt: ${reason}`, { event: "gasoil.capture.failed" });
        return { status: "failed", reason };
      }
      if (!isSaneCbrbPricePer100Liters(parsed.parsed.pricePer100Liters)) {
        const reason = `Gasolieprijs buiten sanityrange: ${parsed.parsed.pricePer100Liters}`;
        logWarn(`gasoil capture mislukt: ${reason}`, { event: "gasoil.capture.failed" });
        return { status: "failed", reason };
      }

      return await persistDayAndMaybeMonth({
        pricePer100Liters: parsed.parsed.pricePer100Liters,
        observationDate: parsed.parsed.publishedAtIso,
        publishedAtLabel: parsed.parsed.publishedAtLabel,
        retrievedAt,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Interrijn niet bereikbaar.";
      logWarn(`gasoil capture mislukt: ${reason}`, { event: "gasoil.capture.failed" });
      return { status: "failed", reason };
    }
  })();

  try {
    const result = await captureInFlight;
    lastCaptureAt = new Date().toISOString();
    lastCaptureResult = result;
    return result;
  } finally {
    captureInFlight = null;
  }
}

/** Exported for tests: persist a validated day observation and lock month on the 15e. */
export async function captureValidatedNetherlandsObservation(options: {
  pricePer100Liters: number;
  observationDate: string;
  publishedAtLabel?: string | null;
  retrievedAt?: string;
}): Promise<DailyCaptureResult> {
  if (!isSaneCbrbPricePer100Liters(options.pricePer100Liters)) {
    return { status: "failed", reason: "Prijs buiten sanityrange." };
  }
  return persistDayAndMaybeMonth({
    pricePer100Liters: options.pricePer100Liters,
    observationDate: options.observationDate,
    publishedAtLabel: options.publishedAtLabel ?? null,
    retrievedAt: options.retrievedAt ?? new Date().toISOString(),
  });
}

export function getGasOilCaptureStatus() {
  return {
    lastCaptureAt,
    lastCaptureResult,
    schedulerStarted,
    todayAmsterdam: amsterdamCalendarDate(),
  };
}

/**
 * Start daily capture loop in-process (geen aparte container).
 * Draait bij start + elke 6 uur (minimaal dagelijks; vaker op peildatum-dagen).
 */
export function startGasOilDailyCaptureScheduler() {
  if (schedulerStarted) return;
  if (process.env.GASOIL_CAPTURE_ENABLED === "0") {
    logInfo("gasoil capture scheduler uitgeschakeld", { event: "gasoil.capture.skipped" });
    return;
  }
  schedulerStarted = true;
  const intervalMs = Number(process.env.GASOIL_CAPTURE_INTERVAL_MS || 6 * 60 * 60 * 1000);

  const tick = () => {
    void runNetherlandsDailyCapture().catch((error) => {
      const reason = error instanceof Error ? error.message : "onbekend";
      logWarn(`gasoil capture scheduler fout: ${reason}`, { event: "gasoil.capture.failed" });
    });
  };

  // Startup capture (best-effort, delayed so DB migraties klaar zijn)
  setTimeout(tick, 15_000).unref?.();
  setInterval(tick, Number.isFinite(intervalMs) && intervalMs >= 60_000 ? intervalMs : 6 * 60 * 60 * 1000).unref?.();
  logInfo("gasoil capture scheduler gestart", { event: "gasoil.capture.started" });
}
