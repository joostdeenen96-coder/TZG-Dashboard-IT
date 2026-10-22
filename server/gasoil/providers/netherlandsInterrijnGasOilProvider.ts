import { fetchBytes } from "../../providers/http.js";
import { readGasOilDayPrice, writeGasOilDayPrice } from "../cache.js";
import type { GasOilPriceObservation } from "../model.js";
import {
  applicableMonthFromReferenceDate,
  currentApplicableMonthNetherlands,
  formatIsoDate,
  getReferenceDate,
} from "../monthLogic.js";
import { readGasOilDayPriceFromPg, upsertGasOilDayPrice } from "../pgStore.js";
import type { GasOilFetchOutcome, GasOilPriceProvider } from "./gasOilPriceProvider.js";

export const INTERRIJN_URL = "https://www.interrijn.com/nl/";
export const INTERRIJN_ARCHIVE_URL = "https://www.interrijn.com/nl/gasolieprijzen-archief/";
export const INTERRIJN_SOURCE_ID = "interrijn-cbrb-kbn" as const;
export const INTERRIJN_SOURCE_LABEL = "CBRB/KBN via Interrijn";
export const INTERRIJN_UNIT = "EUR/100L CBRB";
export const INTERRIJN_PRODUCT = "GASOLIEPRIJS (€/100L CBRB)";

/**
 * HTML-parser gevalideerd tegen live Interrijn-output (table.gas-levels).
 * @see ../docs/netherlands-interrijn-source.md
 */
export const INTERRIJN_PARSER_VALIDATED = true;

/**
 * Business confirmation: CBRB/KBN via Interrijn is ex BTW voor Teunesen NL-gasolietoeslag.
 * Production default = ex-vat. Geen BTW-correctie; alleen ×10 naar €/1000L.
 */
export type InterrijnVatStatus = "unknown" | "ex-vat" | "incl-vat";

export function interrijnCbrbVatStatus(env: NodeJS.ProcessEnv = process.env): InterrijnVatStatus {
  const raw = (env.GASOIL_NL_CBRB_VAT_STATUS ?? "ex-vat").trim().toLowerCase();
  if (raw === "unknown") return "unknown";
  if (raw === "incl-vat" || raw === "incl" || raw === "inclusive") return "incl-vat";
  if (raw === "ex-vat" || raw === "excl" || raw === "exclusive") return "ex-vat";
  return "ex-vat";
}

/**
 * Business acceptance peildatums (Teunesen) — alleen referentie voor tests.
 * Geen toeslagen hier: die volgen uit Interrijn-prijs ×10 + NL-staffel.
 */
export const NL_OCTOBER_2026_ACCEPTANCE = {
  applicableMonth: "2026-10",
  referenceDate: "2026-09-15",
  priceExVatPer1000Liters: 1686.5,
  pricePer100Liters: 168.65,
} as const;

export const NL_NOVEMBER_2026_ACCEPTANCE = {
  applicableMonth: "2026-11",
  referenceDate: "2026-10-15",
  priceExVatPer1000Liters: 1642.6,
  pricePer100Liters: 164.26,
} as const;

export type InterrijnFetchDep = {
  fetchText?: (url: string) => Promise<string>;
  now?: () => Date;
  vatStatus?: InterrijnVatStatus;
};

export type InterrijnParsedPrice = {
  pricePer100Liters: number;
  unit: string;
  publishedAtLabel: string | null;
  publishedAtIso: string | null;
  caption: string;
  deltaLabel: string | null;
};

export type InterrijnParseResult =
  | { ok: true; parsed: InterrijnParsedPrice }
  | { ok: false; reason: string };

export type InterrijnArchiveRow = {
  isoDate: string;
  dayLabel: string;
  pricePer100Liters: number;
};

export type NetherlandsFetchOutcome =
  | {
      ok: true;
      observation: GasOilPriceObservation;
      rawSourceValue: number;
      sourceKind: "homepage" | "archive";
    }
  | { ok: false; reason: string };

async function defaultFetch(url: string): Promise<string> {
  const bytes = await fetchBytes(url);
  return new TextDecoder("utf-8").decode(bytes);
}

export function isNonProductInterrijnHtml(html: string) {
  const lower = html.toLowerCase();
  return (
    lower.includes("domain welcome page") ||
    lower.includes("virtualmin welcome") ||
    lower.includes("this website is ready for content") ||
    lower.includes('data-type="domain"')
  );
}

export function isInterrijnArchiveLoginWall(html: string) {
  const lower = html.toLowerCase();
  return (
    lower.includes("uitsluitend toegankelijk na registratie") ||
    (lower.includes("gasolieprijzen archief") &&
      lower.includes("inloggen") &&
      !lower.includes("gas-levels") &&
      !/<table[^>]*>[\s\S]*\d{2}-\d{2}-\d{2}/i.test(html))
  );
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&euro;/gi, "€")
    .replace(/&#8364;/g, "€")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)));
}

function stripTags(value: string) {
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

export function parseEuropeanNumber(raw: string): number | null {
  const trimmed = raw.trim().replace(/\s/g, "").replace(/€/g, "");
  if (!trimmed) return null;
  let normalized = trimmed;
  if (normalized.includes(",") && normalized.includes(".")) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else if (normalized.includes(",")) {
    normalized = normalized.replace(",", ".");
  }
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

export function isSaneCbrbPricePer100Liters(price: number) {
  return Number.isFinite(price) && price >= 40 && price <= 400;
}

export function cbrbPer100ToPer1000(pricePer100Liters: number) {
  return Math.round(pricePer100Liters * 10 * 100) / 100;
}

export function parseInterrijnPublishedAt(label: string): string | null {
  const match = /(\d{2})-(\d{2})-(\d{2})(?:\s+(\d{2}):(\d{2}))?/.exec(label.trim());
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = 2000 + Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return formatIsoDate(year, month, day);
}

function extractGasLevelsTable(html: string): string | null {
  const captionIdx = html.search(/GASOLIEPRIJS\s*\(€\/100L\s*CBRB\)/i);
  if (captionIdx < 0) return null;
  const tableStart = html.lastIndexOf("<table", captionIdx);
  if (tableStart < 0) return null;
  const tableEnd = html.indexOf("</table>", captionIdx);
  if (tableEnd < 0) return null;
  const after = html.slice(tableEnd, tableEnd + 800);
  const infoEnd = after.search(/<\/span>/i);
  const tail = infoEnd >= 0 ? after.slice(0, infoEnd + "</span>".length) : after.slice(0, 400);
  return html.slice(tableStart, tableEnd + "</table>".length) + tail;
}

export function parseInterrijnGasolieSection(html: string): InterrijnParseResult {
  if (isNonProductInterrijnHtml(html)) {
    return { ok: false, reason: "Interrijn levert geen productpagina (domain welcome / parking)." };
  }

  const section = extractGasLevelsTable(html);
  if (!section) {
    return { ok: false, reason: 'Sectie "GASOLIEPRIJS (€/100L CBRB)" niet gevonden — mogelijke HTML/schemawijziging.' };
  }

  if (!/€\/100L\s*CBRB/i.test(section)) {
    return { ok: false, reason: 'Eenheid "€/100L CBRB" ontbreekt in gasolie-sectie.' };
  }

  const priceRowMatch = /<tr[^>]*class="[^"]*gass-price[^"]*"[\s\S]*?<\/tr>/i.exec(section);
  if (!priceRowMatch) {
    return { ok: false, reason: "Prijsrij (tr.gass-price) ontbreekt in gasolie-sectie." };
  }
  const priceRow = priceRowMatch[0]!;
  if (!/>\s*Prijs\s*</i.test(priceRow) && !/Prijs/i.test(stripTags(priceRow))) {
    return { ok: false, reason: 'Veldlabel "Prijs" ontbreekt in gass-price-rij.' };
  }

  const dataLevel = /class="gas-arrow"[^>]*data-level="([^"]+)"/i.exec(priceRow);
  const centered = /<span[^>]*class="[^"]*wt-centered[^"]*"[^>]*>\s*€?\s*([0-9][0-9.,\s]*)\s*<\/span>/i.exec(
    priceRow,
  );
  const fromAttr = dataLevel ? parseEuropeanNumber(dataLevel[1]!) : null;
  const fromText = centered ? parseEuropeanNumber(centered[1]!) : null;

  if (fromAttr == null && fromText == null) {
    return { ok: false, reason: "Geen prijswaarde in gass-price-rij." };
  }
  if (fromAttr != null && fromText != null && Math.abs(fromAttr - fromText) > 0.01) {
    return {
      ok: false,
      reason: `Prijs inconsistent tussen data-level (${fromAttr}) en tekst (${fromText}).`,
    };
  }
  const pricePer100Liters = fromText ?? fromAttr!;
  if (!isSaneCbrbPricePer100Liters(pricePer100Liters)) {
    return { ok: false, reason: `Gasolieprijs buiten sanityrange: ${pricePer100Liters} €/100L.` };
  }

  const deltaRow = /<tr[^>]*class="[^"]*gas-difference[^"]*"[\s\S]*?<\/tr>/i.exec(section);
  const deltaLabel = deltaRow ? stripTags(deltaRow[0]!).replace(/Prijsstijging\/daling/i, "").trim() : null;
  if (deltaLabel) {
    const deltaNumber = parseEuropeanNumber(deltaLabel.replace(/^[+-]/, ""));
    if (deltaNumber != null && Math.abs(deltaNumber - pricePer100Liters) < 1e-9) {
      return { ok: false, reason: "Prijsstijging/daling mag niet als prijs worden gelezen." };
    }
  }

  const timeMatch =
    /<time[^>]*datetime="([^"]+)"[^>]*>\s*([^<]*)<\/time>/i.exec(section) ||
    /€\/100L\s*CBRB\s*\|\s*<time[^>]*>([^<]*)<\/time>/i.exec(section);
  const publishedAtLabel = timeMatch
    ? stripTags(timeMatch[2] ?? timeMatch[1] ?? "").trim() || stripTags(timeMatch[1]!).trim()
    : null;
  const publishedAtIso = publishedAtLabel ? parseInterrijnPublishedAt(publishedAtLabel) : null;

  const captionMatch = /<caption[^>]*>([\s\S]*?)<\/caption>/i.exec(section);
  const caption = captionMatch ? stripTags(captionMatch[1]!) : INTERRIJN_PRODUCT;

  return {
    ok: true,
    parsed: {
      pricePer100Liters,
      unit: INTERRIJN_UNIT,
      publishedAtLabel,
      publishedAtIso,
      caption,
      deltaLabel,
    },
  };
}

/**
 * Parse historical archive rows. Supports tables with date + price cells.
 * Returns empty when login-walled or schema unknown.
 */
export function parseInterrijnArchiveHtml(html: string): InterrijnArchiveRow[] {
  if (isInterrijnArchiveLoginWall(html)) return [];
  const rows: InterrijnArchiveRow[] = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch: RegExpExecArray | null;
  while ((trMatch = trRe.exec(html))) {
    const cells = [...trMatch[1]!.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) =>
      stripTags(m[1]!),
    );
    if (cells.length < 2) continue;
    let isoDate: string | null = null;
    let dayLabel = "";
    let price: number | null = null;
    for (const cell of cells) {
      const asDate = parseInterrijnPublishedAt(cell);
      if (asDate && !isoDate) {
        isoDate = asDate;
        dayLabel = cell;
        continue;
      }
      const asPrice = parseEuropeanNumber(cell);
      if (asPrice != null && isSaneCbrbPricePer100Liters(asPrice)) {
        price = asPrice;
      }
    }
    if (isoDate && price != null) {
      rows.push({ isoDate, dayLabel, pricePer100Liters: price });
    }
  }
  return rows;
}

export function observationFromCbrbExVat(options: {
  pricePer100Liters: number;
  referenceDate: string;
  retrievedAt: string;
  publishedAtLabel?: string | null;
}): GasOilPriceObservation {
  const priceExVatPer1000Liters = cbrbPer100ToPer1000(options.pricePer100Liters);
  return {
    country: "NL",
    referenceDate: options.referenceDate,
    applicableMonth: applicableMonthFromReferenceDate(options.referenceDate),
    priceExVatPer1000Liters,
    source: INTERRIJN_SOURCE_ID,
    sourceLabel: INTERRIJN_SOURCE_LABEL,
    retrievedAt: options.retrievedAt,
    productLabel: INTERRIJN_PRODUCT,
    rawPricePer100LitersCbrb: options.pricePer100Liters,
    conversionNote: `business ex-BTW; €/100L CBRB × 10 → €/1000L${
      options.publishedAtLabel ? `; bronpublicatie ${options.publishedAtLabel}` : ""
    }`,
  };
}

function assertExVat(vatStatus: InterrijnVatStatus): Extract<NetherlandsFetchOutcome, { ok: false }> | null {
  if (vatStatus === "unknown") {
    return {
      ok: false,
      reason: "CBRB BTW-status unknown — productie vereist GASOIL_NL_CBRB_VAT_STATUS=ex-vat.",
    };
  }
  if (vatStatus === "incl-vat") {
    return {
      ok: false,
      reason: "CBRB incl. BTW wordt niet omgerekend; businessregel is ex-vat zonder correctie.",
    };
  }
  return null;
}

/**
 * Homepage mag alleen de peildatum dekken wanneer de publicatiedatum exact de 15e is.
 * Nooit zomaar de actuele dagprijs voor een andere peildatum gebruiken.
 */
export function observationFromHomepageForReferenceDate(options: {
  html: string;
  referenceDate: string;
  retrievedAt: string;
  vatStatus?: InterrijnVatStatus;
}): NetherlandsFetchOutcome {
  const vatBlock = assertExVat(options.vatStatus ?? interrijnCbrbVatStatus());
  if (vatBlock) return vatBlock;

  const parsed = parseInterrijnGasolieSection(options.html);
  if (!parsed.ok) return { ok: false, reason: parsed.reason };

  if (!parsed.parsed.publishedAtIso) {
    return { ok: false, reason: "Publicatiedatum ontbreekt op Interrijn-homepage." };
  }
  if (parsed.parsed.publishedAtIso !== options.referenceDate) {
    return {
      ok: false,
      reason: `Homepage-publicatie ${parsed.parsed.publishedAtIso} is niet peildatum ${options.referenceDate}; dagprijs wordt niet gebruikt.`,
    };
  }

  return {
    ok: true,
    sourceKind: "homepage",
    rawSourceValue: parsed.parsed.pricePer100Liters,
    observation: observationFromCbrbExVat({
      pricePer100Liters: parsed.parsed.pricePer100Liters,
      referenceDate: options.referenceDate,
      retrievedAt: options.retrievedAt,
      publishedAtLabel: parsed.parsed.publishedAtLabel,
    }),
  };
}

export function observationFromArchiveForReferenceDate(options: {
  html: string;
  referenceDate: string;
  retrievedAt: string;
  vatStatus?: InterrijnVatStatus;
}): NetherlandsFetchOutcome {
  const vatBlock = assertExVat(options.vatStatus ?? interrijnCbrbVatStatus());
  if (vatBlock) return vatBlock;

  if (isInterrijnArchiveLoginWall(options.html)) {
    return {
      ok: false,
      reason: "Interrijn gasolieprijzenarchief vereist login; historische peildatum niet publiek uitleesbaar.",
    };
  }

  const rows = parseInterrijnArchiveHtml(options.html);
  const match = rows.find((row) => row.isoDate === options.referenceDate);
  if (!match) {
    return {
      ok: false,
      reason: `Geen Interrijn-archiefnotering op peildatum ${options.referenceDate}. Geen fallback op dagprijs.`,
    };
  }

  return {
    ok: true,
    sourceKind: "archive",
    rawSourceValue: match.pricePer100Liters,
    observation: observationFromCbrbExVat({
      pricePer100Liters: match.pricePer100Liters,
      referenceDate: options.referenceDate,
      retrievedAt: options.retrievedAt,
      publishedAtLabel: match.dayLabel,
    }),
  };
}

/**
 * Persist homepage CBRB day price (file + optional PG). Used so the 15e peildatum
 * can be locked even when later daily prices differ.
 */
export async function captureInterrijnDayPrice(options: {
  html: string;
  retrievedAt: string;
  vatStatus?: InterrijnVatStatus;
}): Promise<{ captured: boolean; publishedDate: string | null; reason?: string }> {
  const vatBlock = assertExVat(options.vatStatus ?? interrijnCbrbVatStatus());
  if (vatBlock) return { captured: false, publishedDate: null, reason: vatBlock.reason };

  const parsed = parseInterrijnGasolieSection(options.html);
  if (!parsed.ok) return { captured: false, publishedDate: null, reason: parsed.reason };
  if (!parsed.parsed.publishedAtIso) {
    return { captured: false, publishedDate: null, reason: "Publicatiedatum ontbreekt." };
  }

  const entry = {
    country: "NL" as const,
    publishedDate: parsed.parsed.publishedAtIso,
    pricePer100Liters: parsed.parsed.pricePer100Liters,
    source: INTERRIJN_SOURCE_ID,
    publishedAtLabel: parsed.parsed.publishedAtLabel,
    retrievedAt: options.retrievedAt,
  };
  writeGasOilDayPrice(entry);
  void upsertGasOilDayPrice(entry);
  return { captured: true, publishedDate: entry.publishedDate };
}

async function observationFromDayHistory(options: {
  referenceDate: string;
  retrievedAt: string;
  vatStatus: InterrijnVatStatus;
}): Promise<NetherlandsFetchOutcome | null> {
  const vatBlock = assertExVat(options.vatStatus);
  if (vatBlock) return vatBlock;

  let day = readGasOilDayPrice("NL", options.referenceDate);
  if (!day) {
    day = await readGasOilDayPriceFromPg("NL", options.referenceDate, INTERRIJN_SOURCE_ID);
    if (day) writeGasOilDayPrice(day);
  }
  if (!day) return null;

  return {
    ok: true,
    sourceKind: "homepage",
    rawSourceValue: day.pricePer100Liters,
    observation: observationFromCbrbExVat({
      pricePer100Liters: day.pricePer100Liters,
      referenceDate: options.referenceDate,
      retrievedAt: options.retrievedAt,
      publishedAtLabel: day.publishedAtLabel,
    }),
  };
}

/** @deprecated prefer getObservationForApplicableMonth — kept for narrow parse tests */
export function parseInterrijnHtml(
  html: string,
  options: { now?: Date; vatStatus?: InterrijnVatStatus; referenceDate?: string } = {},
): GasOilFetchOutcome {
  if (!INTERRIJN_PARSER_VALIDATED) {
    return { ok: false, reason: "Interrijn-parser is nog niet gevalideerd." };
  }
  const now = options.now ?? new Date();
  const referenceDate =
    options.referenceDate ?? getReferenceDate(currentApplicableMonthNetherlands(now));
  const outcome = observationFromHomepageForReferenceDate({
    html,
    referenceDate,
    retrievedAt: now.toISOString(),
    vatStatus: options.vatStatus,
  });
  if (outcome.ok) return { ok: true, observation: outcome.observation };
  return { ok: false, reason: outcome.reason };
}

export class NetherlandsInterrijnGasOilProvider implements GasOilPriceProvider {
  readonly country = "NL" as const;
  readonly sourceId = INTERRIJN_SOURCE_ID;
  readonly sourceLabel = INTERRIJN_SOURCE_LABEL;
  private readonly fetchText: (url: string) => Promise<string>;
  private readonly nowFn: (() => Date) | undefined;
  private readonly vatStatusOverride: InterrijnVatStatus | undefined;
  lastParse: InterrijnParseResult | null = null;

  constructor(deps: InterrijnFetchDep = {}) {
    this.fetchText = deps.fetchText ?? defaultFetch;
    this.nowFn = deps.now;
    this.vatStatusOverride = deps.vatStatus;
  }

  async getObservationForApplicableMonth(applicableMonth: string): Promise<NetherlandsFetchOutcome> {
    const now = this.nowFn?.() ?? new Date();
    const referenceDate = getReferenceDate(applicableMonth);
    const retrievedAt = now.toISOString();
    const vatStatus = this.vatStatusOverride ?? interrijnCbrbVatStatus();

    try {
      // 1) Archief (historische peildatum) — voorkeur wanneer publiek leesbaar
      try {
        const archiveHtml = await this.fetchText(INTERRIJN_ARCHIVE_URL);
        const fromArchive = observationFromArchiveForReferenceDate({
          html: archiveHtml,
          referenceDate,
          retrievedAt,
          vatStatus,
        });
        if (fromArchive.ok) return fromArchive;
        // Loginwall / missing row: fall through
      } catch {
        // Archive fetch optional
      }

      // 2) Persistente daghistorie voor exacte peildatum (vastgelegd op/na de 15e)
      const fromHistory = await observationFromDayHistory({ referenceDate, retrievedAt, vatStatus });
      if (fromHistory?.ok) return fromHistory;

      // 3) Homepage alleen bij exacte publicatiedatum = peildatum; altijd day-capture
      const homeHtml = await this.fetchText(INTERRIJN_URL);
      if (isNonProductInterrijnHtml(homeHtml)) {
        this.lastParse = { ok: false, reason: "Interrijn levert geen productpagina." };
        return { ok: false, reason: "Interrijn levert geen productpagina." };
      }
      this.lastParse = parseInterrijnGasolieSection(homeHtml);
      await captureInterrijnDayPrice({ html: homeHtml, retrievedAt, vatStatus });

      // Herlees historie: als homepage exact peildatum publiceerde, zit die nu in day cache
      const afterCapture = await observationFromDayHistory({ referenceDate, retrievedAt, vatStatus });
      if (afterCapture?.ok) return afterCapture;

      return observationFromHomepageForReferenceDate({
        html: homeHtml,
        referenceDate,
        retrievedAt,
        vatStatus,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Interrijn niet bereikbaar.";
      this.lastParse = { ok: false, reason: message };
      return { ok: false, reason: message };
    }
  }

  async getCurrentObservation(): Promise<GasOilFetchOutcome> {
    const now = this.nowFn?.() ?? new Date();
    const outcome = await this.getObservationForApplicableMonth(currentApplicableMonthNetherlands(now));
    if (outcome.ok) return { ok: true, observation: outcome.observation };
    return { ok: false, reason: outcome.reason };
  }
}
