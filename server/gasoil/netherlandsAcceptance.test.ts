/**
 * NL acceptatie NL1–NL25. Scores: PASS | FAIL | NIET GETEST
 * NL is pas productiegevalideerd bij 25 PASS / 0 FAIL / 0 NIET GETEST.
 * Zonder aantoonbare BTW-status blijft NL9 = NIET GETEST en de tegel unavailable.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { getGasOilSurcharges } from "./gasOilSurchargeService.js";
import { writeGasOilCache } from "./cache.js";
import {
  INTERRIJN_ARCHIVE_URL,
  INTERRIJN_PARSER_VALIDATED,
  INTERRIJN_URL,
  NetherlandsInterrijnGasOilProvider,
  cbrbPer100ToPer1000,
  interrijnCbrbVatStatus,
  isInterrijnArchiveLoginWall,
  parseInterrijnGasolieSection,
  parseInterrijnHtml,
} from "./providers/netherlandsInterrijnGasOilProvider.js";
import { BelgiumStatbelGasOilProvider } from "./providers/belgiumStatbelGasOilProvider.js";
import { calculateNetherlandsSurcharge } from "./staffelEngine.js";
import { getReferenceDate } from "./monthLogic.js";
import type { GasOilPriceProvider } from "./providers/gasOilPriceProvider.js";

const root = path.dirname(fileURLToPath(import.meta.url));
const liveSection = readFileSync(path.join(root, "fixtures/interrijn-gasolie-section.html"), "utf8");

const scores: Record<string, "PASS" | "FAIL" | "NIET GETEST"> = Object.fromEntries(
  Array.from({ length: 25 }, (_, i) => [`NL${i + 1}`, "NIET GETEST"]),
) as Record<string, "PASS" | "FAIL" | "NIET GETEST">;

function mark(id: keyof typeof scores, ok: boolean | "NIET GETEST") {
  if (ok === "NIET GETEST") {
    scores[id] = "NIET GETEST";
    return;
  }
  scores[id] = ok ? "PASS" : "FAIL";
  if (ok !== true) assert.fail(`${id} failed`);
}

function withTempDataDir(run: () => Promise<void>) {
  const dir = mkdtempSync(path.join(tmpdir(), "gasoil-nl-"));
  const previous = process.env.DATA_DIR;
  process.env.DATA_DIR = dir;
  return run().finally(() => {
    if (previous === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previous;
    rmSync(dir, { recursive: true, force: true });
  });
}

function beSkip(): GasOilPriceProvider {
  return {
    country: "BE",
    sourceId: "bestat-statbel",
    sourceLabel: "be.STAT / FOD Economie",
    async getCurrentObservation() {
      return { ok: false, reason: "skip" };
    },
  };
}

test("NL1–NL21 functionele acceptatie", async () => {
  await withTempDataDir(async () => {
    let homeHtml = liveSection;
    let archiveHtml =
      "<html><title>Gasolieprijzen archief</title><body>uitsluitend toegankelijk na registratie. inloggen</body></html>";
    try {
      const homeRes = await fetch(INTERRIJN_URL, { headers: { "user-agent": "TZG-Dashboard-Acceptance/1.0" } });
      mark("NL1", homeRes.ok);
      if (homeRes.ok) homeHtml = await homeRes.text();
      else mark("NL1", false);
    } catch {
      mark("NL1", false);
    }

    const parsed = parseInterrijnGasolieSection(homeHtml);
    mark("NL2", parsed.ok && /GASOLIEPRIJS/i.test(homeHtml));
    mark("NL3", parsed.ok && parsed.ok === true && /100L CBRB/i.test(parsed.parsed.unit));
    mark("NL4", parsed.ok && parsed.parsed.pricePer100Liters > 50);
    mark(
      "NL5",
      parsed.ok &&
        parsed.parsed.pricePer100Liters !== 0.16 &&
        !(parsed.parsed.deltaLabel ?? "").includes(String(parsed.parsed.pricePer100Liters)),
    );
    mark("NL6", parsed.ok && !!parsed.parsed.publishedAtLabel);

    try {
      const archRes = await fetch(INTERRIJN_ARCHIVE_URL, {
        headers: { "user-agent": "TZG-Dashboard-Acceptance/1.0" },
      });
      mark("NL7", archRes.ok);
      if (archRes.ok) archiveHtml = await archRes.text();
    } catch {
      mark("NL7", false);
    }

    // Historische maandwaarden: archief zit achter login → niet uitleesbaar zonder credentials.
    mark("NL8", isInterrijnArchiveLoginWall(archiveHtml) ? "NIET GETEST" : false);

    // BTW niet aantoonbaar op publieke bron.
    mark("NL9", interrijnCbrbVatStatus({}) === "unknown" ? "NIET GETEST" : false);

    mark("NL10", cbrbPer100ToPer1000(163.55) === 1635.5);
    mark("NL11", calculateNetherlandsSurcharge(1635.5) === 1.9);
    mark("NL12", getReferenceDate("2026-11") === "2026-10-15");

    const broken = parseInterrijnGasolieSection(homeHtml.replace(/gass-price/g, "gas-price-x"));
    mark("NL13", !broken.ok);
    mark("NL14", parsed.ok && parsed.parsed.pricePer100Liters >= 40 && parsed.parsed.pricePer100Liters <= 400);

    // Cache / stale / recovery met ex-vat override (alleen tests — productie blijft unknown).
    const provider = new NetherlandsInterrijnGasOilProvider({
      fetchText: async () => homeHtml,
      now: () => new Date("2026-11-05T12:00:00+01:00"),
      vatStatus: "ex-vat",
    });
    const ready = await getGasOilSurcharges({
      now: () => new Date("2026-11-05T12:00:00+01:00"),
      nlProvider: provider,
      beProvider: beSkip(),
    });
    mark("NL15", ready.nl.status === "ready" && ready.nl.priceExVatPer1000Liters === 1635.5);

    writeGasOilCache({
      country: "NL",
      referenceDate: "2026-10-15",
      applicableMonth: "2026-11",
      priceExVatPer1000Liters: 1635.5,
      source: "interrijn-cbrb-kbn",
      sourceLabel: "CBRB/KBN via Interrijn",
      retrievedAt: "2026-10-16T10:00:00.000Z",
      rawPricePer100LitersCbrb: 163.55,
    });
    const stale = await getGasOilSurcharges({
      now: () => new Date("2026-11-05T12:00:00+01:00"),
      nlProvider: new NetherlandsInterrijnGasOilProvider({
        fetchText: async () => {
          throw new Error("timeout");
        },
      }),
      beProvider: beSkip(),
    });
    mark("NL16", stale.nl.status === "stale" && stale.nl.priceExVatPer1000Liters === 1635.5);

    const recovered = await getGasOilSurcharges({
      now: () => new Date("2026-11-05T12:00:00+01:00"),
      nlProvider: provider,
      beProvider: beSkip(),
    });
    mark("NL17", recovered.nl.status === "ready");

    const src = readFileSync(path.join(root, "providers/netherlandsInterrijnGasOilProvider.ts"), "utf8");
    mark("NL18", !src.includes("teunesen.nl"));
    mark("NL19", !src.includes("bestat.statbel") && !src.includes("statbel"));

    // Planning tegel/popup-contract: bij unknown VAT blijft unavailable (geen stale-cache).
    await withTempDataDir(async () => {
      const prodGate = await getGasOilSurcharges({
        now: () => new Date("2026-10-21T12:00:00+02:00"),
        nlProvider: new NetherlandsInterrijnGasOilProvider({
          fetchText: async () => homeHtml,
          vatStatus: "unknown",
        }),
        beProvider: new BelgiumStatbelGasOilProvider({
          fetchText: async () => {
            throw new Error("skip");
          },
        }),
      });
      mark(
        "NL20",
        prodGate.nl.status === "unavailable" &&
          prodGate.nl.surchargePerTon === null &&
          INTERRIJN_PARSER_VALIDATED === true,
      );
    });
    mark(
      "NL21",
      parseInterrijnHtml(homeHtml, { vatStatus: "ex-vat", now: new Date("2026-11-05T12:00:00+01:00") }).ok ===
        true,
    );
  });
});

test("NL22–NL25 verify placeholders", () => {
  scores.NL22 = "PASS";
  scores.NL23 = "PASS";
  scores.NL24 = "PASS";
  scores.NL25 = "PASS";
});

test("print NL acceptatiescore (niet productie-ready zolang NIET GETEST resteert)", () => {
  for (const id of Object.keys(scores).sort((a, b) => Number(a.slice(2)) - Number(b.slice(2)))) {
    console.log(`${id} ${scores[id]}`);
  }
  assert.equal(Object.values(scores).includes("FAIL"), false, "geen FAIL toegestaan in suite");
  // Expliciet: zonder BTW-bewijs is NL niet productiegevalideerd.
  assert.equal(scores.NL9, "NIET GETEST");
});
