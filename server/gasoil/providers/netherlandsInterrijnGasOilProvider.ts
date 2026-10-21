import { fetchBytes } from "../../providers/http.js";
import type { GasOilPriceObservation } from "../model.js";
import {
  applicableMonthFromReferenceDate,
  currentApplicableMonth,
  formatIsoDate,
  getReferenceDate,
} from "../monthLogic.js";
import type { GasOilFetchOutcome, GasOilPriceProvider } from "./gasOilPriceProvider.js";

export const INTERRIJN_URL = "https://www.interrijn.com/nl/";
export const INTERRIJN_ARCHIVE_URL = "https://www.interrijn.com/nl/gasolieprijzen-archief/";
export const INTERRIJN_SOURCE_ID = "interrijn-cbrb-kbn" as const;
export const INTERRIJN_SOURCE_LABEL = "CBRB/KBN via Interrijn";
export const INTERRIJN_UNIT = "EUR/100L CBRB";
export const INTERRIJN_PRODUCT = "GASOLIEPRIJS (€/100L CBRB)";

/**
 * HTML-parser is gevalideerd tegen live Interrijn-output (table.gas-levels).
 * Productie-toeslag blijft geblokkeerd zolang BTW-status unknown is.
 * @see ../docs/netherlands-interrijn-source.md
 */
export const INTERRIJN_PARSER_VALIDATED = true;

/** Bewezen BTW-status van de publieke CBRB-notering. Default: unknown. */
export type InterrijnVatStatus = "unknown" | "ex-vat" | "incl-vat";

export function interrijnCbrbVatStatus(env: NodeJS.ProcessEnv = process.env): InterrijnVatStatus {
  const raw = (env.GASOIL_NL_CBRB_VAT_STATUS ?? "unknown").trim().toLowerCase();
  if (raw === "ex-vat" || raw === "excl" || raw === "exclusive") return "ex-vat";
  if (raw === "incl-vat" || raw === "incl" || raw === "inclusive") return "incl-vat";
  return "unknown";
}

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

async function defaultFetch(url: string): Promise<string> {
  const bytes = await fetchBytes(url);
  return new TextDecoder("utf-8").decode(bytes);
}

/** Detect parking / welcome pages that are HTTP 200 but not the real Interrijn app. */
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
    (lower.includes("gasolieprijzen archief") && lower.includes("inloggen") && !lower.includes("gas-levels"))
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

/** Parse European or plain decimals: 163,55 / 163.55 / 1.635,50 */
export function parseEuropeanNumber(raw: string): number | null {
  const trimmed = raw.trim().replace(/\s/g, "").replace(/€/g, "");
  if (!trimmed) return null;
  let normalized = trimmed;
  if (normalized.includes(",") && normalized.includes(".")) {
    // 1.635,50 → 1635.50
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

/** Interrijn time labels: datetime="20-10-26 12:00" → 2026-10-20 (date part). */
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
  // Include following archive + wt-info (publication time / unit).
  const after = html.slice(tableEnd, tableEnd + 800);
  const infoEnd = after.search(/<\/span>/i);
  const tail = infoEnd >= 0 ? after.slice(0, infoEnd + "</span>".length) : after.slice(0, 400);
  return html.slice(tableStart, tableEnd + "</table>".length) + tail;
}

/**
 * Strict parser: only the GASOLIEPRIJS (€/100L CBRB) widget.
 * Does not scan the whole page for euro amounts.
 */
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
    return { ok: false, reason: 'Prijsrij (tr.gass-price) ontbreekt in gasolie-sectie.' };
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

  // Ensure delta row is not confused: if somehow only delta matched, reject.
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
    conversionNote: `ex BTW aangenomen; €/100L CBRB × 10 → €/1000L${
      options.publishedAtLabel ? `; bronpublicatie ${options.publishedAtLabel}` : ""
    }`,
  };
}

/**
 * Full page parse + BTW-gate. Returns ok only when VAT is proven ex-vat.
 */
export function parseInterrijnHtml(
  html: string,
  options: { now?: Date; vatStatus?: InterrijnVatStatus } = {},
): GasOilFetchOutcome {
  if (!INTERRIJN_PARSER_VALIDATED) {
    return {
      ok: false,
      reason: "Interrijn-parser is nog niet gevalideerd tegen echte CBRB/KBN-output (NL7).",
    };
  }

  const parsed = parseInterrijnGasolieSection(html);
  if (!parsed.ok) return { ok: false, reason: parsed.reason };

  const vatStatus = options.vatStatus ?? interrijnCbrbVatStatus();
  if (vatStatus === "unknown") {
    return {
      ok: false,
      reason:
        "CBRB-prijs uitgelezen, maar BTW-status (ex/incl) is niet aantoonbaar op Interrijn — geen productie-toeslag (NL9).",
    };
  }
  if (vatStatus === "incl-vat") {
    return {
      ok: false,
      reason:
        "CBRB-prijs lijkt incl. BTW; officiële ex-BTW-conversie is nog niet gedocumenteerd/geïmplementeerd.",
    };
  }

  const now = options.now ?? new Date();
  const applicableMonth = currentApplicableMonth(now);
  const referenceDate = getReferenceDate(applicableMonth);
  return {
    ok: true,
    observation: observationFromCbrbExVat({
      pricePer100Liters: parsed.parsed.pricePer100Liters,
      referenceDate,
      retrievedAt: now.toISOString(),
      publishedAtLabel: parsed.parsed.publishedAtLabel,
    }),
  };
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

  async getCurrentObservation(): Promise<GasOilFetchOutcome> {
    try {
      const html = await this.fetchText(INTERRIJN_URL);
      if (isNonProductInterrijnHtml(html)) {
        this.lastParse = { ok: false, reason: "Interrijn levert geen productpagina." };
        return { ok: false, reason: "Interrijn levert geen productpagina." };
      }
      const section = parseInterrijnGasolieSection(html);
      this.lastParse = section;
      return parseInterrijnHtml(html, {
        now: this.nowFn?.() ?? new Date(),
        vatStatus: this.vatStatusOverride ?? interrijnCbrbVatStatus(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Interrijn niet bereikbaar.";
      this.lastParse = { ok: false, reason: message };
      return { ok: false, reason: message };
    }
  }
}
