import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { calculateNetherlandsSurcharge, staffelRangeFor } from "../staffelEngine.js";
import { getReferenceDate } from "../monthLogic.js";
import {
  INTERRIJN_PARSER_VALIDATED,
  INTERRIJN_SOURCE_ID,
  INTERRIJN_SOURCE_LABEL,
  INTERRIJN_URL,
  NL_NOVEMBER_2026_ACCEPTANCE,
  NL_OCTOBER_2026_ACCEPTANCE,
  NetherlandsInterrijnGasOilProvider,
  cbrbPer100ToPer1000,
  interrijnCbrbVatStatus,
  isInterrijnArchiveLoginWall,
  isNonProductInterrijnHtml,
  observationFromArchiveForReferenceDate,
  observationFromCbrbExVat,
  observationFromHomepageForReferenceDate,
  parseEuropeanNumber,
  parseInterrijnArchiveHtml,
  parseInterrijnGasolieSection,
} from "./netherlandsInterrijnGasOilProvider.js";

const fixtureDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../fixtures");
const welcomeHtml = readFileSync(path.join(fixtureDir, "interrijn-domain-welcome.html"), "utf8");
const liveSectionHtml = readFileSync(path.join(fixtureDir, "interrijn-gasolie-section.html"), "utf8");
const archiveSample = readFileSync(path.join(fixtureDir, "interrijn-archive-sample.html"), "utf8");
const homepage15okt = readFileSync(path.join(fixtureDir, "interrijn-homepage-peildatum-15okt.html"), "utf8");

test("parser validated + default VAT ex-vat", () => {
  assert.equal(INTERRIJN_PARSER_VALIDATED, true);
  assert.equal(interrijnCbrbVatStatus({}), "ex-vat");
  assert.equal(interrijnCbrbVatStatus({ GASOIL_NL_CBRB_VAT_STATUS: "ex-vat" }), "ex-vat");
});

test("source ids en labels", () => {
  const provider = new NetherlandsInterrijnGasOilProvider({});
  assert.equal(provider.sourceId, INTERRIJN_SOURCE_ID);
  assert.equal(provider.sourceLabel, INTERRIJN_SOURCE_LABEL);
  assert.equal(INTERRIJN_URL, "https://www.interrijn.com/nl/");
});

test("welcome/parking HTML wordt herkend", () => {
  assert.equal(isNonProductInterrijnHtml(welcomeHtml), true);
  assert.equal(isNonProductInterrijnHtml(liveSectionHtml), false);
});

test("parseEuropeanNumber + ×10 conversie", () => {
  assert.equal(parseEuropeanNumber("163,55"), 163.55);
  assert.equal(cbrbPer100ToPer1000(163.55), 1635.5);
});

test("live fixture: GASOLIEPRIJS + unit + prijs, niet delta", () => {
  const parsed = parseInterrijnGasolieSection(liveSectionHtml);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.parsed.pricePer100Liters, 163.55);
  assert.match(parsed.parsed.unit, /100L CBRB/i);
});

test("homepage alleen bij exacte peildatum", () => {
  const wrongDay = observationFromHomepageForReferenceDate({
    html: liveSectionHtml,
    referenceDate: "2026-10-15",
    retrievedAt: "2026-10-21T12:00:00.000Z",
    vatStatus: "ex-vat",
  });
  assert.equal(wrongDay.ok, false);

  const exact = observationFromHomepageForReferenceDate({
    html: homepage15okt,
    referenceDate: "2026-10-15",
    retrievedAt: "2026-11-05T12:00:00.000Z",
    vatStatus: "ex-vat",
  });
  assert.equal(exact.ok, true);
  if (exact.ok) {
    assert.equal(exact.observation.priceExVatPer1000Liters, 1642.6);
    assert.equal(exact.observation.applicableMonth, "2026-11");
    assert.equal(calculateNetherlandsSurcharge(exact.observation.priceExVatPer1000Liters), 1.9);
  }
});

test("archief peildatum sep/okt reproduceert business acceptance toeslagen", () => {
  const rows = parseInterrijnArchiveHtml(archiveSample);
  assert.equal(rows.length, 2);

  const okt = observationFromArchiveForReferenceDate({
    html: archiveSample,
    referenceDate: NL_OCTOBER_2026_ACCEPTANCE.referenceDate,
    retrievedAt: "2026-10-21T12:00:00.000Z",
    vatStatus: "ex-vat",
  });
  assert.equal(okt.ok, true);
  if (okt.ok) {
    assert.equal(okt.observation.priceExVatPer1000Liters, NL_OCTOBER_2026_ACCEPTANCE.priceExVatPer1000Liters);
    assert.equal(calculateNetherlandsSurcharge(okt.observation.priceExVatPer1000Liters), 2.0);
    assert.deepEqual(staffelRangeFor("NL", okt.observation.priceExVatPer1000Liters), {
      from: 1675,
      to: 1699.99,
    });
  }

  const nov = observationFromArchiveForReferenceDate({
    html: archiveSample,
    referenceDate: NL_NOVEMBER_2026_ACCEPTANCE.referenceDate,
    retrievedAt: "2026-11-05T12:00:00.000Z",
    vatStatus: "ex-vat",
  });
  assert.equal(nov.ok, true);
  if (nov.ok) {
    assert.equal(nov.observation.priceExVatPer1000Liters, NL_NOVEMBER_2026_ACCEPTANCE.priceExVatPer1000Liters);
    assert.equal(calculateNetherlandsSurcharge(nov.observation.priceExVatPer1000Liters), 1.9);
    assert.deepEqual(staffelRangeFor("NL", nov.observation.priceExVatPer1000Liters), {
      from: 1625,
      to: 1649.99,
    });
  }
});

test("maandlogica peildatums", () => {
  assert.equal(getReferenceDate("2026-10"), "2026-09-15");
  assert.equal(getReferenceDate("2026-11"), "2026-10-15");
  assert.equal(getReferenceDate("2026-12"), "2026-11-15");
});

test("provider gebruikt archief vóór homepage voor peildatum", async () => {
  const provider = new NetherlandsInterrijnGasOilProvider({
    fetchText: async (url) => {
      if (url.includes("archief")) return archiveSample;
      return liveSectionHtml; // wrong published date for nov
    },
    now: () => new Date("2026-11-05T12:00:00+01:00"),
    vatStatus: "ex-vat",
  });
  const outcome = await provider.getObservationForApplicableMonth("2026-11");
  assert.equal(outcome.ok, true);
  if (outcome.ok) {
    assert.equal(outcome.sourceKind, "archive");
    assert.equal(outcome.observation.priceExVatPer1000Liters, 1642.6);
    assert.equal(calculateNetherlandsSurcharge(outcome.observation.priceExVatPer1000Liters), 1.9);
  }
});

test("provider fail-closed wanneer peildatum niet in archief/homepage", async () => {
  const provider = new NetherlandsInterrijnGasOilProvider({
    fetchText: async (url) => {
      if (url.includes("archief")) {
        return "<html><title>Gasolieprijzen archief</title><body>uitsluitend toegankelijk na registratie. inloggen</body></html>";
      }
      return liveSectionHtml; // published 20-10-26
    },
    now: () => new Date("2026-10-21T12:00:00+02:00"),
    vatStatus: "ex-vat",
  });
  const outcome = await provider.getCurrentObservation();
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.match(outcome.reason, /peildatum|dagprijs|archief|login/i);
});

test("archief loginwall detectie", () => {
  assert.equal(
    isInterrijnArchiveLoginWall(
      "<html><title>Gasolieprijzen archief</title><body>uitsluitend toegankelijk na registratie. inloggen</body></html>",
    ),
    true,
  );
  assert.equal(isInterrijnArchiveLoginWall(archiveSample), false);
});

test("observationFromCbrbExVat vult maand", () => {
  const observation = observationFromCbrbExVat({
    pricePer100Liters: 168.65,
    referenceDate: "2026-09-15",
    retrievedAt: "2026-10-21T12:00:00.000Z",
  });
  assert.equal(observation.applicableMonth, "2026-10");
  assert.equal(observation.priceExVatPer1000Liters, 1686.5);
});

test("schemawijziging faalt dicht", () => {
  const html = liveSectionHtml.replace(/GASOLIEPRIJS \(€\/100L CBRB\)/g, "Brandstofprijs");
  assert.equal(parseInterrijnGasolieSection(html).ok, false);
});

test("acceptance fixtures zijn geen runtime hardcodes in provider-URL", () => {
  const src = readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "netherlandsInterrijnGasOilProvider.ts"),
    "utf8",
  );
  assert.equal(src.includes("teunesen.nl"), false);
  assert.equal(src.includes("bestat.statbel"), false);
  // Runtime mag acceptance constants exporteren voor tests, maar niet als default observation prijs gebruiken
  assert.match(src, /NL_NOVEMBER_2026_ACCEPTANCE/);
  assert.match(src, /getObservationForApplicableMonth/);
});
