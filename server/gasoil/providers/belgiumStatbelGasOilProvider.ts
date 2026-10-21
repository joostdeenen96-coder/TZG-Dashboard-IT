import { fetchBytes } from "../../providers/http.js";
import type { GasOilPriceObservation } from "../model.js";
import {
  applicableMonthFromReferenceDate,
  currentApplicableMonth,
  formatIsoDate,
  referenceDateForApplicableMonth,
} from "../monthLogic.js";
import type { GasOilFetchOutcome, GasOilPriceProvider } from "./gasOilPriceProvider.js";

export const STATBEL_SOURCE_ID = "bestat-statbel" as const;
export const STATBEL_SOURCE_LABEL = "be.STAT / FOD Economie";

/**
 * Officiële ~365-dagen JSON-view (Prijs incl. BTW).
 * @see ../docs/belgium-bestat-source.md
 */
export const STATBEL_HISTORY_JSON =
  "https://bestat.statbel.fgov.be/bestat/api/views/f8d4c0ce-bec4-4f58-b2a2-4f6b8667ad24/result/JSON";

/** Laatste publicatiedag met native Prijs excl. BTW + incl. BTW. */
export const STATBEL_DAY_JSON =
  "https://bestat.statbel.fgov.be/bestat/api/views/c42c9c16-9330-437b-9608-13781b795ec1/result/JSON";

/** Legacy CSV aliases (tests / fallback parsing). */
export const STATBEL_HISTORY_CSV =
  "https://bestat.statbel.fgov.be/bestat/api/views/f8d4c0ce-bec4-4f58-b2a2-4f6b8667ad24/result/CSV";
export const STATBEL_DAY_CSV =
  "https://bestat.statbel.fgov.be/bestat/api/views/c42c9c16-9330-437b-9608-13781b795ec1/result/CSV";

/**
 * Product gevalideerd tegen Teunesen BE 2026-fixtures (9/11 exact, 2× ±0.10 afronding).
 * November 2026: 1.5666 incl → 1294.70 ex/1000L → toeslag 0.96.
 * Oktober 2026: 1.5274 incl → 1262.30 ex/1000L → toeslag 0.93.
 */
export const BELGIUM_PRODUCT = "Gasolie verwarming (H0/H7) (vanaf 2000 l) (€/L)";
export const BELGIUM_PRODUCT_IDENTIFIER = BELGIUM_PRODUCT;
export const BELGIUM_UNIT = "EUR/L";

/**
 * BTW-divisor voor incl→excl wanneer geen native excl. beschikbaar is.
 * Bron: be.STAT dagview-ratio ≈ 1.21 + standaard 21% BTW op aardolieproducten.
 * Configureerbaar via GASOIL_BE_VAT_DIVISOR (bijv. "1.21").
 */
export const BELGIUM_VAT_DIVISOR_DEFAULT = 1.21;

export function belgiumVatDivisor(env: NodeJS.ProcessEnv = process.env) {
  const raw = env.GASOIL_BE_VAT_DIVISOR?.trim();
  if (!raw) return BELGIUM_VAT_DIVISOR_DEFAULT;
  const value = Number(raw.replace(",", "."));
  if (!Number.isFinite(value) || value < 1.01 || value > 1.5) {
    throw new Error(`GASOIL_BE_VAT_DIVISOR ongeldig: ${raw}`);
  }
  return value;
}

export const NOVEMBER_2026_FIXTURE = {
  referenceDate: "2026-10-15",
  applicableMonth: "2026-11",
  priceInclPerLiter: 1.5666,
  priceExVatPer1000Liters: 1294.7,
  surchargePerTon: 0.96,
  product: BELGIUM_PRODUCT,
} as const;

export const OCTOBER_2026_FIXTURE = {
  referenceDate: "2026-09-15",
  applicableMonth: "2026-10",
  priceInclPerLiter: 1.5274,
  priceExVatPer1000Liters: 1262.3,
  surchargePerTon: 0.93,
  staffelFrom: 1250,
  staffelTo: 1274.99,
  product: BELGIUM_PRODUCT,
  vatStatus: "incl" as const,
} as const;

/** Alias gevraagd in specificatie: peildatum voor toepassingsmaand. */
export function getReferenceDate(applicableMonth: string) {
  return referenceDateForApplicableMonth(applicableMonth);
}

export type StatbelFetchDep = {
  fetchText?: (url: string) => Promise<string>;
  now?: () => Date;
  vatDivisor?: number;
};

export type BelgiumSourceRecord = {
  dayLabel: string;
  isoDate: string;
  product: string;
  priceIncl: number | null;
  priceExcl: number | null;
  unit: string;
  vatStatus: "excl" | "incl";
};

export type BelgiumBuildDiagnostics = {
  referenceDate: string;
  applicableMonth: string;
  productIdentifier: string;
  unit: string;
  vatStatus: "excl" | "incl-converted";
  vatDivisor: number | null;
  sourceRecord: BelgiumSourceRecord | null;
  historyEndpoint: string;
  dayEndpoint: string;
};

export type BelgiumObservationBuild = {
  observation: GasOilPriceObservation;
  diagnostics: BelgiumBuildDiagnostics;
  rawSourceValue: number;
  vatStatus: "excl" | "incl-converted";
};

async function defaultFetch(url: string): Promise<string> {
  const bytes = await fetchBytes(url);
  return new TextDecoder("utf-8").decode(bytes);
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current);
  return cells;
}

function parseNumber(raw: unknown) {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  const normalized = raw.trim().replace(",", ".");
  if (!normalized) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

/** be.STAT day labels like 15okt26 → 2026-10-15 */
export function parseBestatDayLabel(label: string): string | null {
  const match = /^(\d{2})([a-z]{3})(\d{2})$/i.exec(label.trim());
  if (!match) return null;
  const day = Number(match[1]);
  const mon = match[2]!.toLowerCase();
  const year = 2000 + Number(match[3]);
  const months: Record<string, number> = {
    jan: 1,
    feb: 2,
    mrt: 3,
    mar: 3,
    apr: 4,
    mei: 5,
    may: 5,
    jun: 6,
    jul: 7,
    aug: 8,
    sep: 9,
    okt: 10,
    oct: 10,
    nov: 11,
    dec: 12,
  };
  const month = months[mon];
  if (!month || day < 1 || day > 31) return null;
  return formatIsoDate(year, month, day);
}

export function inclPerLiterToExVatPer1000(
  inclPerLiter: number,
  vatDivisor: number = BELGIUM_VAT_DIVISOR_DEFAULT,
) {
  const exclPerLiter = Math.round((inclPerLiter / vatDivisor) * 10_000) / 10_000;
  return Math.round(exclPerLiter * 1000 * 10) / 10;
}

export function exclPerLiterToPer1000(exclPerLiter: number) {
  return Math.round(exclPerLiter * 1000 * 10) / 10;
}

export function isSaneGasOilPricePer1000(price: number) {
  return Number.isFinite(price) && price >= 200 && price <= 4000;
}

type HistoryRow = {
  dayLabel: string;
  isoDate: string;
  product: string;
  priceIncl: number;
};

type DayRow = {
  dayLabel: string;
  isoDate: string;
  product: string;
  priceExcl: number | null;
  priceIncl: number | null;
};

function factsFromPayload(payload: unknown): Record<string, unknown>[] {
  if (!payload || typeof payload !== "object") return [];
  const facts = (payload as { facts?: unknown }).facts;
  if (!Array.isArray(facts)) return [];
  return facts.filter((row): row is Record<string, unknown> => !!row && typeof row === "object");
}

export function parseHistoryJson(jsonText: string): HistoryRow[] {
  const payload: unknown = JSON.parse(jsonText);
  const rows: HistoryRow[] = [];
  for (const fact of factsFromPayload(payload)) {
    const dayLabel = String(fact["Dag"] ?? fact["Day"] ?? "").trim();
    const product = String(fact["Product"] ?? "").trim();
    const priceIncl = parseNumber(fact["Prijs incl. BTW"] ?? fact["Price incl. VAT"]);
    const isoDate = parseBestatDayLabel(dayLabel);
    if (!isoDate || priceIncl === null || !product) continue;
    rows.push({ dayLabel, isoDate, product, priceIncl });
  }
  return rows;
}

export function parseDayJson(jsonText: string): DayRow[] {
  const payload: unknown = JSON.parse(jsonText);
  const rows: DayRow[] = [];
  for (const fact of factsFromPayload(payload)) {
    const dayLabel = String(fact["Dag"] ?? fact["Day"] ?? "").trim();
    const product = String(fact["Product"] ?? "").trim();
    const priceExcl = parseNumber(fact["Prijs excl. BTW"] ?? fact["Price excl. VAT"]);
    const priceIncl = parseNumber(fact["Prijs incl. BTW"] ?? fact["Price incl. VAT"]);
    const isoDate = parseBestatDayLabel(dayLabel);
    if (!isoDate || !product) continue;
    rows.push({ dayLabel, isoDate, product, priceExcl, priceIncl });
  }
  return rows;
}

export function parseHistoryCsv(csv: string): HistoryRow[] {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const header = parseCsvLine(lines[0]!).map((h) => h.trim());
  const dayIdx = header.indexOf("Dag");
  const productIdx = header.indexOf("Product");
  const inclIdx = header.indexOf("Prijs incl. BTW");
  if (dayIdx < 0 || productIdx < 0 || inclIdx < 0) {
    throw new Error("be.STAT historie-CSV heeft onverwachte kolommen.");
  }
  const rows: HistoryRow[] = [];
  for (const line of lines.slice(1)) {
    const cells = parseCsvLine(line);
    const dayLabel = cells[dayIdx]?.trim() ?? "";
    const product = cells[productIdx]?.trim() ?? "";
    const priceIncl = parseNumber(cells[inclIdx] ?? "");
    const isoDate = parseBestatDayLabel(dayLabel);
    if (!isoDate || priceIncl === null || !product) continue;
    rows.push({ dayLabel, isoDate, product, priceIncl });
  }
  return rows;
}

export function parseDayCsv(csv: string): DayRow[] {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const header = parseCsvLine(lines[0]!).map((h) => h.trim());
  const dayIdx = header.indexOf("Dag");
  const productIdx = header.indexOf("Product");
  const exclIdx = header.indexOf("Prijs excl. BTW");
  const inclIdx = header.indexOf("Prijs incl. BTW");
  if (dayIdx < 0 || productIdx < 0 || exclIdx < 0 || inclIdx < 0) {
    throw new Error("be.STAT dag-CSV heeft onverwachte kolommen.");
  }
  const rows: DayRow[] = [];
  for (const line of lines.slice(1)) {
    const cells = parseCsvLine(line);
    const dayLabel = cells[dayIdx]?.trim() ?? "";
    const product = cells[productIdx]?.trim() ?? "";
    const priceExcl = parseNumber(cells[exclIdx] ?? "");
    const priceIncl = parseNumber(cells[inclIdx] ?? "");
    const isoDate = parseBestatDayLabel(dayLabel);
    if (!isoDate || !product) continue;
    rows.push({ dayLabel, isoDate, product, priceExcl, priceIncl });
  }
  return rows;
}

function parseHistoryPayload(text: string): HistoryRow[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return parseHistoryJson(trimmed);
  return parseHistoryCsv(trimmed);
}

function parseDayPayload(text: string): DayRow[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return parseDayJson(trimmed);
  return parseDayCsv(trimmed);
}

export function observationFromIncl(
  referenceDate: string,
  priceInclPerLiter: number,
  retrievedAt: string,
  vatDivisor: number = BELGIUM_VAT_DIVISOR_DEFAULT,
): GasOilPriceObservation {
  const priceExVatPer1000Liters = inclPerLiterToExVatPer1000(priceInclPerLiter, vatDivisor);
  if (!isSaneGasOilPricePer1000(priceExVatPer1000Liters)) {
    throw new Error(`Gasolieprijs buiten sanityrange: ${priceExVatPer1000Liters}`);
  }
  return {
    country: "BE",
    referenceDate,
    applicableMonth: applicableMonthFromReferenceDate(referenceDate),
    priceExVatPer1000Liters,
    source: STATBEL_SOURCE_ID,
    sourceLabel: STATBEL_SOURCE_LABEL,
    retrievedAt,
    productLabel: BELGIUM_PRODUCT,
    rawPriceInclPerLiter: priceInclPerLiter,
    conversionNote: `excl = round(incl/${vatDivisor},4)*1000 (1 decimaal); GASOIL_BE_VAT_DIVISOR; native excl heeft voorkeur wanneer peildatum in dagview staat`,
  };
}

export function buildBelgiumObservation(options: {
  referenceDate: string;
  historyText: string;
  dayText: string;
  retrievedAt: string;
  vatDivisor?: number;
}): BelgiumObservationBuild {
  const vatDivisor = options.vatDivisor ?? BELGIUM_VAT_DIVISOR_DEFAULT;
  const applicableMonth = applicableMonthFromReferenceDate(options.referenceDate);
  const baseDiagnostics: BelgiumBuildDiagnostics = {
    referenceDate: options.referenceDate,
    applicableMonth,
    productIdentifier: BELGIUM_PRODUCT_IDENTIFIER,
    unit: BELGIUM_UNIT,
    vatStatus: "incl-converted",
    vatDivisor,
    sourceRecord: null,
    historyEndpoint: STATBEL_HISTORY_JSON,
    dayEndpoint: STATBEL_DAY_JSON,
  };

  const dayRows = parseDayPayload(options.dayText).filter((row) => row.product === BELGIUM_PRODUCT);
  const dayMatch = dayRows.find((row) => row.isoDate === options.referenceDate);
  if (dayMatch?.priceExcl != null) {
    const price = exclPerLiterToPer1000(dayMatch.priceExcl);
    if (!isSaneGasOilPricePer1000(price)) throw new Error(`Gasolieprijs buiten sanityrange: ${price}`);
    const observation: GasOilPriceObservation = {
      country: "BE",
      referenceDate: options.referenceDate,
      applicableMonth,
      priceExVatPer1000Liters: price,
      source: STATBEL_SOURCE_ID,
      sourceLabel: STATBEL_SOURCE_LABEL,
      retrievedAt: options.retrievedAt,
      productLabel: BELGIUM_PRODUCT,
      conversionNote: "Prijs excl. BTW × 1000 uit be.STAT dagview (officiële ex-BTW)",
    };
    return {
      observation,
      rawSourceValue: dayMatch.priceExcl,
      vatStatus: "excl",
      diagnostics: {
        ...baseDiagnostics,
        vatStatus: "excl",
        vatDivisor: null,
        sourceRecord: {
          dayLabel: dayMatch.dayLabel,
          isoDate: dayMatch.isoDate,
          product: dayMatch.product,
          priceIncl: dayMatch.priceIncl,
          priceExcl: dayMatch.priceExcl,
          unit: BELGIUM_UNIT,
          vatStatus: "excl",
        },
      },
    };
  }

  const historyRows = parseHistoryPayload(options.historyText).filter(
    (row) => row.product === BELGIUM_PRODUCT,
  );
  const historyMatch = historyRows.find((row) => row.isoDate === options.referenceDate);
  if (!historyMatch) {
    throw new Error(
      `Geen be.STAT-notering voor ${BELGIUM_PRODUCT} op peildatum ${options.referenceDate}. Geen fallback.`,
    );
  }
  const observation = observationFromIncl(
    options.referenceDate,
    historyMatch.priceIncl,
    options.retrievedAt,
    vatDivisor,
  );
  return {
    observation,
    rawSourceValue: historyMatch.priceIncl,
    vatStatus: "incl-converted",
    diagnostics: {
      ...baseDiagnostics,
      vatStatus: "incl-converted",
      vatDivisor,
      sourceRecord: {
        dayLabel: historyMatch.dayLabel,
        isoDate: historyMatch.isoDate,
        product: historyMatch.product,
        priceIncl: historyMatch.priceIncl,
        priceExcl: null,
        unit: BELGIUM_UNIT,
        vatStatus: "incl",
      },
    },
  };
}

export type BelgiumFetchOutcome =
  | { ok: true; observation: GasOilPriceObservation; diagnostics: BelgiumBuildDiagnostics; rawSourceValue: number; vatStatus: "excl" | "incl-converted" }
  | { ok: false; reason: string; diagnostics?: BelgiumBuildDiagnostics };

export class BelgiumStatbelGasOilProvider implements GasOilPriceProvider {
  readonly country = "BE" as const;
  readonly sourceId = STATBEL_SOURCE_ID;
  readonly sourceLabel = STATBEL_SOURCE_LABEL;
  private readonly fetchText: (url: string) => Promise<string>;
  private readonly nowFn: (() => Date) | undefined;
  private readonly vatDivisorOverride: number | undefined;
  lastDiagnostics: BelgiumBuildDiagnostics | null = null;

  constructor(deps: StatbelFetchDep = {}) {
    this.fetchText = deps.fetchText ?? defaultFetch;
    this.nowFn = deps.now;
    this.vatDivisorOverride = deps.vatDivisor;
  }

  async getObservationForApplicableMonth(applicableMonth: string): Promise<BelgiumFetchOutcome> {
    const now = this.nowFn?.() ?? new Date();
    const referenceDate = getReferenceDate(applicableMonth);
    const retrievedAt = now.toISOString();
    const vatDivisor = this.vatDivisorOverride ?? belgiumVatDivisor();
    try {
      const [historyText, dayText] = await Promise.all([
        this.fetchText(STATBEL_HISTORY_JSON),
        this.fetchText(STATBEL_DAY_JSON),
      ]);
      const built = buildBelgiumObservation({
        referenceDate,
        historyText,
        dayText,
        retrievedAt,
        vatDivisor,
      });
      this.lastDiagnostics = built.diagnostics;
      return {
        ok: true,
        observation: built.observation,
        diagnostics: built.diagnostics,
        rawSourceValue: built.rawSourceValue,
        vatStatus: built.vatStatus,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "be.STAT niet bereikbaar.";
      this.lastDiagnostics = {
        referenceDate,
        applicableMonth,
        productIdentifier: BELGIUM_PRODUCT_IDENTIFIER,
        unit: BELGIUM_UNIT,
        vatStatus: "incl-converted",
        vatDivisor,
        sourceRecord: null,
        historyEndpoint: STATBEL_HISTORY_JSON,
        dayEndpoint: STATBEL_DAY_JSON,
      };
      return { ok: false, reason: message, diagnostics: this.lastDiagnostics };
    }
  }

  async getCurrentObservation(): Promise<GasOilFetchOutcome> {
    const now = this.nowFn?.() ?? new Date();
    const applicableMonth = currentApplicableMonth(now);
    const outcome = await this.getObservationForApplicableMonth(applicableMonth);
    if (outcome.ok) return { ok: true, observation: outcome.observation };
    return { ok: false, reason: outcome.reason };
  }
}
