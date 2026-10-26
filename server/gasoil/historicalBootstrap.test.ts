import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { readGasOilMonthCache, writeGasOilMonthCache } from "./cache.js";
import { getGasOilSurcharges } from "./gasOilSurchargeService.js";
import {
  assertHistoricalStaffel,
  ensureNetherlandsHistoricalBootstrap,
  NL_HISTORICAL_BOOTSTRAP,
  NL_HISTORICAL_SOURCE_LABEL,
} from "./historicalBootstrap.js";
import { INTERRIJN_SOURCE_ID, INTERRIJN_URL } from "./providers/netherlandsInterrijnGasOilProvider.js";
import { calculateNetherlandsSurcharge } from "./staffelEngine.js";
import type { GasOilFetchOutcome, GasOilPriceProvider } from "./providers/gasOilPriceProvider.js";

const here = path.dirname(fileURLToPath(import.meta.url));

function withTempDataDir(run: () => Promise<void>) {
  const dir = mkdtempSync(path.join(tmpdir(), "gasoil-nl-bootstrap-"));
  const previous = process.env.DATA_DIR;
  process.env.DATA_DIR = dir;
  return run().finally(() => {
    if (previous === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previous;
    rmSync(dir, { recursive: true, force: true });
  });
}

function failingProvider(): GasOilPriceProvider {
  const outcome: GasOilFetchOutcome = { ok: false, reason: "bron uit" };
  return {
    country: "NL",
    sourceId: "interrijn-cbrb-kbn",
    sourceLabel: "CBRB/KBN via Interrijn",
    async getCurrentObservation() {
      return outcome;
    },
  };
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

const priceFormatter = new Intl.NumberFormat("nl-NL", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const peildatumFormatter = new Intl.DateTimeFormat("nl-NL", {
  timeZone: "Europe/Amsterdam",
  day: "numeric",
  month: "long",
  year: "numeric",
});

const monthFormatter = new Intl.DateTimeFormat("nl-NL", {
  timeZone: "Europe/Amsterdam",
  month: "long",
  year: "numeric",
});

test("NL1–NL6 staffel op gepubliceerde bronprijs, peildatum uit de clausule", () => {
  const october = NL_HISTORICAL_BOOTSTRAP[0];
  const november = NL_HISTORICAL_BOOTSTRAP[1];
  assert.equal(october.priceExVatPer1000Liters, 1686.5);
  assert.equal(november.priceExVatPer1000Liters, 1642.6);
  assert.equal(calculateNetherlandsSurcharge(1686.5), 2);
  assert.equal(calculateNetherlandsSurcharge(1642.6), 1.9);
  assert.equal(october.referenceDate, "2026-09-15");
  assert.equal(october.applicableMonth, "2026-10");
  assert.equal(november.referenceDate, "2026-10-15");
  assert.equal(november.applicableMonth, "2026-11");
  assert.doesNotThrow(() => assertHistoricalStaffel());
  const src = readFileSync(path.join(here, "historicalBootstrap.ts"), "utf8");
  assert.match(src, /surchargePerTon: calculateNetherlandsSurcharge\(/);
  assert.equal(/surchargePerTon:\s*2(?:\.0+)?\b/.test(src), false);
  assert.equal(/surchargePerTon:\s*1\.9\b/.test(src), false);
});

test("NL7–NL10 bootstrap is idempotent en overschrijft geen geldige observatie", async () => {
  await withTempDataDir(async () => {
    const src = readFileSync(path.join(here, "historicalBootstrap.ts"), "utf8");
    const index = readFileSync(path.join(here, "../index.ts"), "utf8");
    const provider = readFileSync(path.join(here, "providers/netherlandsInterrijnGasOilProvider.ts"), "utf8");
    const capture = readFileSync(path.join(here, "dailyCapture.ts"), "utf8");
    assert.equal(src.includes("teunesen.nl"), false);
    assert.equal(src.includes("fetch("), false);
    assert.equal(index.includes("teunesen.nl"), false);
    assert.match(index, /startGasOilDailyCaptureScheduler/);
    assert.equal(provider.includes(INTERRIJN_URL), true);
    assert.equal(provider.includes("teunesen.nl"), false);
    assert.match(capture, /INTERRIJN_URL/);
    assert.match(readFileSync(path.join(here, "gasOilSurchargeService.ts"), "utf8"), /sourceType: "automatic"/);

    writeGasOilMonthCache({
      country: "NL",
      referenceDate: "2026-09-15",
      applicableMonth: "2026-10",
      rawSourceValue: 170,
      priceExVatPer1000Liters: 1700,
      productIdentifier: "GASOLIEPRIJS (€/100L CBRB)",
      source: INTERRIJN_SOURCE_ID,
      retrievedAt: "2026-09-15T12:00:00.000Z",
      sourceLabel: "CBRB/KBN via Interrijn",
      vatStatus: "excl",
      surchargePerTon: calculateNetherlandsSurcharge(1700),
      sourceType: "automatic",
    });

    const guarded = await ensureNetherlandsHistoricalBootstrap();
    assert.deepEqual(guarded.created, ["2026-11"]);
    assert.deepEqual(guarded.skipped, ["2026-10"]);
    const kept = readGasOilMonthCache("NL", "2026-10");
    assert.equal(kept?.priceExVatPer1000Liters, 1700);
    assert.equal(kept?.sourceType, "automatic");
    assert.equal(kept?.sourceLabel, "CBRB/KBN via Interrijn");
    assert.equal(kept?.rawSourceValue, 170);
  });
});

test("NL7 NL11–NL16 lege cache krijgt oktober en november uit de staffel", async () => {
  await withTempDataDir(async () => {
    const first = await ensureNetherlandsHistoricalBootstrap();
    assert.deepEqual(first.created, ["2026-10", "2026-11"]);
    const october = readGasOilMonthCache("NL", "2026-10");
    const november = readGasOilMonthCache("NL", "2026-11");
    assert.equal(october?.priceExVatPer1000Liters, 1686.5);
    assert.equal(october?.rawSourceValue, 1686.5);
    assert.equal(october?.publishedPriceUnit, "EUR/1000L");
    assert.equal(october?.referenceDate, "2026-09-15");
    assert.equal(october?.source, INTERRIJN_SOURCE_ID);
    assert.equal(october?.sourceType, "manual-bootstrap");
    assert.equal(october?.sourceLabel, NL_HISTORICAL_SOURCE_LABEL);
    assert.equal(october?.surchargePerTon, calculateNetherlandsSurcharge(1686.5));
    assert.equal(october?.surchargePerTon, 2);
    assert.match(october?.conversionNote ?? "", /prijs per 1000 liter/);
    assert.equal(november?.priceExVatPer1000Liters, 1642.6);
    assert.equal(november?.referenceDate, "2026-10-15");
    assert.equal(november?.sourceType, "manual-bootstrap");
    assert.equal(november?.surchargePerTon, 1.9);
    assert.equal(readGasOilMonthCache("NL", "2026-12"), null);

    const second = await ensureNetherlandsHistoricalBootstrap();
    assert.deepEqual(second.created, []);
    assert.deepEqual(second.skipped, ["2026-10", "2026-11"]);
    assert.equal(readGasOilMonthCache("NL", "2026-10")?.priceExVatPer1000Liters, 1686.5);

    const octoberView = await getGasOilSurcharges({
      now: () => new Date("2026-10-26T12:00:00+01:00"),
      nlProvider: failingProvider(),
      beProvider: beSkip(),
    });
    assert.equal(octoberView.nl.current.applicableMonth, "2026-10");
    assert.equal(octoberView.nl.current.surchargePerTon, 2);
    assert.equal(octoberView.nl.current.priceExVatPer1000Liters, 1686.5);
    assert.equal(octoberView.nl.current.referenceDate, "2026-09-15");
    assert.equal(octoberView.nl.current.sourceType, "manual-bootstrap");
    assert.equal(octoberView.nl.current.sourceLabel, NL_HISTORICAL_SOURCE_LABEL);
    assert.equal(octoberView.nl.current.sourcePricePer100Liters, null);
    assert.equal(octoberView.nl.current.rawPricePer100LitersCbrb, null);
    assert.equal(octoberView.nl.current.source, INTERRIJN_SOURCE_ID);
    assert.equal(octoberView.nl.next.applicableMonth, "2026-11");
    assert.equal(octoberView.nl.next.surchargePerTon, 1.9);
    assert.equal(octoberView.nl.next.priceExVatPer1000Liters, 1642.6);
    assert.equal(octoberView.nl.next.referenceDate, "2026-10-15");
    assert.equal(octoberView.nl.next.sourcePricePer100Liters, null);
    assert.equal(octoberView.nl.next.sourceLabel, NL_HISTORICAL_SOURCE_LABEL);

    const novemberView = await getGasOilSurcharges({
      now: () => new Date("2026-11-01T12:00:00+01:00"),
      nlProvider: failingProvider(),
      beProvider: beSkip(),
    });
    assert.equal(novemberView.nl.current.applicableMonth, "2026-11");
    assert.equal(novemberView.nl.current.surchargePerTon, 1.9);
    assert.equal(novemberView.nl.next.applicableMonth, "2026-12");
    assert.equal(novemberView.nl.next.surchargePerTon, null);
    assert.notEqual(novemberView.nl.next.surchargePerTon, 0);
    assert.equal(novemberView.nl.next.priceExVatPer1000Liters, null);
    assert.equal(novemberView.nl.next.message, "Nog niet vastgesteld");

    const dialog = readFileSync(path.join(here, "../../src/components/GasOilDetailDialog.tsx"), "utf8");
    const card = readFileSync(path.join(here, "../../src/components/DieselCard.tsx"), "utf8");
    assert.match(dialog, /<dt className="text-mist">Maand<\/dt>/);
    assert.match(dialog, /<dt className="text-mist">Peildatum<\/dt>/);
    assert.match(dialog, /result\.country === "NL" \? "Prijs"/);
    assert.match(dialog, /<dt className="text-mist">Toeslag<\/dt>/);
    assert.match(dialog, /<dt className="text-mist">Bron<\/dt>/);
    assert.match(dialog, /1000 L ex BTW/);
    assert.match(dialog, /data-gas-detail-reference/);
    assert.match(dialog, /data-gas-detail-price/);
    assert.match(dialog, /data-gas-detail-surcharge/);
    assert.match(dialog, /data-gas-detail-source/);
    assert.match(dialog, /typeof bronPrijs === "number"/);
    assert.equal(card.includes("€2,00"), false);
    assert.equal(card.includes("€1,90"), false);
    assert.match(card, /data-gas-month=\{kind\}/);

    assert.equal(monthFormatter.format(new Date("2026-10-01T12:00:00+02:00")), "oktober 2026");
    assert.equal(peildatumFormatter.format(new Date("2026-09-15T12:00:00+02:00")), "15 september 2026");
    assert.equal(peildatumFormatter.format(new Date("2026-10-15T12:00:00+02:00")), "15 oktober 2026");
    assert.match(priceFormatter.format(1686.5), /1\.686,50/);
    assert.match(priceFormatter.format(1642.6), /1\.642,60/);
    assert.match(priceFormatter.format(2), /2,00/);
    assert.match(priceFormatter.format(1.9), /1,90/);
  });
});
