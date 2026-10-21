import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { calculateNetherlandsSurcharge } from "../staffelEngine.js";
import {
  INTERRIJN_ARCHIVE_URL,
  INTERRIJN_PARSER_VALIDATED,
  INTERRIJN_SOURCE_ID,
  INTERRIJN_SOURCE_LABEL,
  INTERRIJN_URL,
  NetherlandsInterrijnGasOilProvider,
  cbrbPer100ToPer1000,
  interrijnCbrbVatStatus,
  isInterrijnArchiveLoginWall,
  isNonProductInterrijnHtml,
  observationFromCbrbExVat,
  parseEuropeanNumber,
  parseInterrijnGasolieSection,
  parseInterrijnHtml,
  parseInterrijnPublishedAt,
} from "./netherlandsInterrijnGasOilProvider.js";

const fixtureDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../fixtures");
const welcomeHtml = readFileSync(path.join(fixtureDir, "interrijn-domain-welcome.html"), "utf8");
const liveSectionHtml = readFileSync(path.join(fixtureDir, "interrijn-gasolie-section.html"), "utf8");

test("INTERRIJN_PARSER_VALIDATED is true na live HTML-validatie", () => {
  assert.equal(INTERRIJN_PARSER_VALIDATED, true);
});

test("source ids en labels", () => {
  const provider = new NetherlandsInterrijnGasOilProvider({
    fetchText: async () => {
      throw new Error("niet aanroepen");
    },
  });
  assert.equal(provider.sourceId, INTERRIJN_SOURCE_ID);
  assert.equal(provider.sourceLabel, INTERRIJN_SOURCE_LABEL);
  assert.equal(INTERRIJN_URL, "https://www.interrijn.com/nl/");
  assert.equal(INTERRIJN_ARCHIVE_URL, "https://www.interrijn.com/nl/gasolieprijzen-archief/");
});

test("welcome/parking HTML wordt herkend", () => {
  assert.equal(isNonProductInterrijnHtml(welcomeHtml), true);
  assert.equal(isNonProductInterrijnHtml(liveSectionHtml), false);
});

test("parseEuropeanNumber ondersteunt EU en punt-decimalen", () => {
  assert.equal(parseEuropeanNumber("163,55"), 163.55);
  assert.equal(parseEuropeanNumber("163.55"), 163.55);
  assert.equal(parseEuropeanNumber("€ 163.55"), 163.55);
});

test("live fixture: GASOLIEPRIJS sectie + unit + prijs, niet de delta", () => {
  const parsed = parseInterrijnGasolieSection(liveSectionHtml);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.parsed.pricePer100Liters, 163.55);
  assert.match(parsed.parsed.unit, /100L CBRB/i);
  assert.ok(parsed.parsed.deltaLabel == null || !parsed.parsed.deltaLabel.includes("163.55"));
  assert.equal(parseInterrijnPublishedAt(parsed.parsed.publishedAtLabel ?? ""), "2026-10-20");
});

test("prijsstijging/daling wordt niet als prijs gelezen", () => {
  const html = liveSectionHtml.replace("163.55", "0.16").replace('data-level="163.55"', 'data-level="0.16"');
  // Still has delta +0.16 — if price row equals delta magnitude with insane small value, sanity fails
  const parsed = parseInterrijnGasolieSection(html);
  assert.equal(parsed.ok, false);
});

test("schemawijziging zonder caption faalt dicht", () => {
  const html = liveSectionHtml.replace(/GASOLIEPRIJS \(€\/100L CBRB\)/g, "Brandstofprijs");
  const parsed = parseInterrijnGasolieSection(html);
  assert.equal(parsed.ok, false);
});

test("eenheidsconversie ×10 (controle, geen hardcoded productieprijs)", () => {
  assert.equal(cbrbPer100ToPer1000(163.55), 1635.5);
  assert.equal(calculateNetherlandsSurcharge(1635.5), 1.9);
});

test("default BTW-status is unknown → geen productie-observation", () => {
  assert.equal(interrijnCbrbVatStatus({}), "unknown");
  const outcome = parseInterrijnHtml(liveSectionHtml, {
    now: new Date("2026-10-21T12:00:00+02:00"),
    vatStatus: "unknown",
  });
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.match(outcome.reason, /BTW/i);
});

test("ex-vat override levert observation met ×10 conversie", () => {
  const outcome = parseInterrijnHtml(liveSectionHtml, {
    now: new Date("2026-11-05T12:00:00+01:00"),
    vatStatus: "ex-vat",
  });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(outcome.observation.priceExVatPer1000Liters, 1635.5);
  assert.equal(outcome.observation.rawPricePer100LitersCbrb, 163.55);
  assert.equal(outcome.observation.referenceDate, "2026-10-15");
  assert.equal(outcome.observation.applicableMonth, "2026-11");
  assert.equal(outcome.observation.source, "interrijn-cbrb-kbn");
});

test("observationFromCbrbExVat vult maandlogica", () => {
  const observation = observationFromCbrbExVat({
    pricePer100Liters: 160,
    referenceDate: "2026-09-15",
    retrievedAt: "2026-10-21T12:00:00.000Z",
  });
  assert.equal(observation.applicableMonth, "2026-10");
  assert.equal(observation.priceExVatPer1000Liters, 1600);
});

test("archief loginwall detectie", () => {
  const wall =
    "<html><title>Gasolieprijzen archief</title><body>uitsluitend toegankelijk na registratie. inloggen</body></html>";
  assert.equal(isInterrijnArchiveLoginWall(wall), true);
  assert.equal(isInterrijnArchiveLoginWall(liveSectionHtml), false);
});

test("Interrijn onbereikbaar -> unavailable outcome", async () => {
  const provider = new NetherlandsInterrijnGasOilProvider({
    fetchText: async () => {
      throw new Error("Bron niet bereikbaar.");
    },
  });
  const outcome = await provider.getCurrentObservation();
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.match(outcome.reason, /niet bereikbaar/i);
});

test("Interrijn welcome page -> unavailable, geen prijs", async () => {
  const provider = new NetherlandsInterrijnGasOilProvider({
    fetchText: async () => welcomeHtml,
  });
  const outcome = await provider.getCurrentObservation();
  assert.equal(outcome.ok, false);
});

test("live fixture zonder VAT-override blijft unavailable (fail-closed)", async () => {
  const provider = new NetherlandsInterrijnGasOilProvider({
    fetchText: async () => liveSectionHtml,
    now: () => new Date("2026-10-21T12:00:00+02:00"),
    vatStatus: "unknown",
  });
  const outcome = await provider.getCurrentObservation();
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.match(outcome.reason, /BTW/i);
  assert.ok(provider.lastParse && provider.lastParse.ok);
  if (provider.lastParse?.ok) {
    assert.equal(provider.lastParse.parsed.pricePer100Liters, 163.55);
  }
});

test("blinde eurobedragen elders op pagina worden genegeerd", () => {
  const html = `<html><body><p>Water € 1.234,56</p><p>Koers € 99,99</p>${liveSectionHtml}</body></html>`;
  const parsed = parseInterrijnGasolieSection(html);
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.equal(parsed.parsed.pricePer100Liters, 163.55);
});
