import { fetchBytes } from "../../providers/http.js";
import type { GasOilPriceObservation } from "../model.js";
import { applicableMonthFromReferenceDate, currentApplicableMonth, referenceDateForApplicableMonth } from "../monthLogic.js";
import type { GasOilFetchOutcome, GasOilPriceProvider } from "./gasOilPriceProvider.js";

export const STATBEL_SOURCE_ID = "bestat-statbel" as const;
export const STATBEL_SOURCE_LABEL = "be.STAT";

/** Multi-day view (incl. BTW only, ~30 days). */
export const STATBEL_HISTORY_CSV =
  "https://bestat.statbel.fgov.be/bestat/api/views/ef2a5bfb-a361-47a6-b113-e3df26563404/result/CSV";

/** Last-day view with Prijs excl. BTW + Prijs incl. BTW. */
export const STATBEL_DAY_CSV =
  "https://bestat.statbel.fgov.be/bestat/api/views/c42c9c16-9330-437b-9608-13781b795ec1/result/CSV";

/**
 * Product selected after November 2026 Teunesen fixture match (1294.70).
 * Gasolie Diesel Verwarming (vanaf 2000 l) rounded to 1295.0 via the same path — rejected.
 * Additional historical month fixtures should be added before claiming full production validation.
 */
export const BELGIUM_PRODUCT =
  "Gasolie verwarming (H0/H7) (vanaf 2000 l) (€/L)";

/** Fixture-backed: incl €/L ÷ 1.21 → excl €/L, then ×1000, 1 decimal (nov 2026 = 1294.70). */
export const BELGIUM_INCL_TO_EXCL_DIVISOR = 1.21;

export const NOVEMBER_2026_FIXTURE = {
  referenceDate: "2026-10-15",
  applicableMonth: "2026-11",
  priceInclPerLiter: 1.5666,
  priceExVatPer1000Liters: 1294.7,
  surchargePerTon: 0.96,
  product: BELGIUM_PRODUCT,
} as const;

export type StatbelFetchDep = {
  fetchText: (url: string) => Promise<string>;
  now?: () => Date;
};

const defaultFetch: StatbelFetchDep["fetchText"] = async (url) => {
  const bytes = await fetchBytes(url);
  return new TextDecoder("utf-8").decode(bytes);
};

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

function parseNumber(raw: string) {
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
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function inclPerLiterToExVatPer1000(inclPerLiter: number) {
  const exclPerLiter = Math.round((inclPerLiter / BELGIUM_INCL_TO_EXCL_DIVISOR) * 10_000) / 10_000;
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

type DayRow = {
  dayLabel: string;
  isoDate: string;
  product: string;
  priceExcl: number | null;
  priceIncl: number | null;
};

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

export function observationFromIncl(
  referenceDate: string,
  priceInclPerLiter: number,
  retrievedAt: string,
): GasOilPriceObservation {
  const priceExVatPer1000Liters = inclPerLiterToExVatPer1000(priceInclPerLiter);
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
    conversionNote: `excl = round(incl/${BELGIUM_INCL_TO_EXCL_DIVISOR},4)*1000 (1 decimaal); native excl-kolom heeft voorkeur wanneer peildatum in dag-CSV staat`,
  };
}

export function buildBelgiumObservation(options: {
  referenceDate: string;
  historyCsv: string;
  dayCsv: string;
  retrievedAt: string;
}): GasOilPriceObservation {
  const dayRows = parseDayCsv(options.dayCsv).filter((row) => row.product === BELGIUM_PRODUCT);
  const dayMatch = dayRows.find((row) => row.isoDate === options.referenceDate);
  if (dayMatch?.priceExcl != null) {
    const price = exclPerLiterToPer1000(dayMatch.priceExcl);
    if (!isSaneGasOilPricePer1000(price)) throw new Error(`Gasolieprijs buiten sanityrange: ${price}`);
    return {
      country: "BE",
      referenceDate: options.referenceDate,
      applicableMonth: applicableMonthFromReferenceDate(options.referenceDate),
      priceExVatPer1000Liters: price,
      source: STATBEL_SOURCE_ID,
      sourceLabel: STATBEL_SOURCE_LABEL,
      retrievedAt: options.retrievedAt,
      productLabel: BELGIUM_PRODUCT,
      conversionNote: "Prijs excl. BTW × 1000 uit be.STAT dagview",
    };
  }

  const historyRows = parseHistoryCsv(options.historyCsv).filter((row) => row.product === BELGIUM_PRODUCT);
  const historyMatch = historyRows.find((row) => row.isoDate === options.referenceDate);
  if (!historyMatch) {
    throw new Error(`Geen be.STAT-notering voor ${BELGIUM_PRODUCT} op ${options.referenceDate}.`);
  }
  return observationFromIncl(options.referenceDate, historyMatch.priceIncl, options.retrievedAt);
}

export class BelgiumStatbelGasOilProvider implements GasOilPriceProvider {
  readonly country = "BE" as const;
  readonly sourceId = STATBEL_SOURCE_ID;
  readonly sourceLabel = STATBEL_SOURCE_LABEL;
  private readonly deps: StatbelFetchDep;

  constructor(deps: StatbelFetchDep = { fetchText: defaultFetch }) {
    this.deps = deps;
  }

  async getCurrentObservation(): Promise<GasOilFetchOutcome> {
    const now = this.deps.now?.() ?? new Date();
    const applicableMonth = currentApplicableMonth(now);
    const referenceDate = referenceDateForApplicableMonth(applicableMonth);
    const retrievedAt = now.toISOString();
    try {
      const [historyCsv, dayCsv] = await Promise.all([
        this.deps.fetchText(STATBEL_HISTORY_CSV),
        this.deps.fetchText(STATBEL_DAY_CSV),
      ]);
      const observation = buildBelgiumObservation({ referenceDate, historyCsv, dayCsv, retrievedAt });
      return { ok: true, observation };
    } catch (error) {
      const message = error instanceof Error ? error.message : "be.STAT niet bereikbaar.";
      return { ok: false, reason: message };
    }
  }
}
