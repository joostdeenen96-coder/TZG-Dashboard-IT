import { fetchBytes } from "../../providers/http.js";
import type { GasOilFetchOutcome, GasOilPriceProvider } from "./gasOilPriceProvider.js";

export const INTERRIJN_URL = "https://www.interrijn.com/nl/";
export const INTERRIJN_SOURCE_ID = "interrijn-cbrb-kbn" as const;
export const INTERRIJN_SOURCE_LABEL = "CBRB/KBN via Interrijn";

/**
 * Set to true ONLY after a real Interrijn page with CBRB/KBN gasoil price
 * has been captured, inspected (unit, VAT, date, frequency), and fixture-tested.
 * Until then every parse path must fail closed → unavailable.
 *
 * NL7 acceptance: NOT TESTED while this remains false.
 */
export const INTERRIJN_PARSER_VALIDATED = false;

export type InterrijnFetchDep = {
  fetchText: (url: string) => Promise<string>;
};

const defaultFetch: InterrijnFetchDep["fetchText"] = async (url) => {
  const bytes = await fetchBytes(url);
  return new TextDecoder("utf-8").decode(bytes);
};

/** Detect parking / welcome pages that are HTTP 200 but not the real Interrijn app. */
export function isNonProductInterrijnHtml(html: string) {
  const lower = html.toLowerCase();
  return (
    lower.includes("domain welcome page") ||
    lower.includes("virtualmin welcome") ||
    lower.includes("this website is ready for content") ||
    lower.includes("data-type=\"domain\"")
  );
}

/**
 * Intentionally does not invent selectors, endpoints, or price extraction.
 * When INTERRIJN_PARSER_VALIDATED becomes true, a strict fixture-backed parser
 * must be added here — never a blind euro-amount regex.
 */
export function parseInterrijnHtml(_html: string): GasOilFetchOutcome {
  if (!INTERRIJN_PARSER_VALIDATED) {
    return {
      ok: false,
      reason: "Interrijn-parser is nog niet gevalideerd tegen echte CBRB/KBN-output (NL7).",
    };
  }
  return {
    ok: false,
    reason: "Gevalideerde Interrijn-parser ontbreekt nog; HTML-extractie is geblokkeerd.",
  };
}

export class NetherlandsInterrijnGasOilProvider implements GasOilPriceProvider {
  readonly country = "NL" as const;
  readonly sourceId = INTERRIJN_SOURCE_ID;
  readonly sourceLabel = INTERRIJN_SOURCE_LABEL;
  private readonly deps: InterrijnFetchDep;

  constructor(deps: InterrijnFetchDep = { fetchText: defaultFetch }) {
    this.deps = deps;
  }

  async getCurrentObservation(): Promise<GasOilFetchOutcome> {
    if (!INTERRIJN_PARSER_VALIDATED) {
      // Still attempt a reachability probe so health can report unavailable vs network errors,
      // but never accept a price until the parser is validated against real content.
      try {
        const html = await this.deps.fetchText(INTERRIJN_URL);
        if (isNonProductInterrijnHtml(html)) {
          return {
            ok: false,
            reason: "Interrijn levert geen productpagina (domain welcome / parking).",
          };
        }
        return {
          ok: false,
          reason: "Interrijn bereikbaar maar parser nog niet gevalideerd (NL7).",
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Interrijn niet bereikbaar.";
        return { ok: false, reason: message };
      }
    }

    try {
      const html = await this.deps.fetchText(INTERRIJN_URL);
      if (isNonProductInterrijnHtml(html)) {
        return { ok: false, reason: "Interrijn levert geen productpagina." };
      }
      return parseInterrijnHtml(html);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Interrijn niet bereikbaar.";
      return { ok: false, reason: message };
    }
  }
}
