import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { calculateBelgiumSurcharge, staffelRangeFor } from "../staffelEngine.js";
import {
  BELGIUM_PRODUCT,
  BelgiumStatbelGasOilProvider,
  NOVEMBER_2026_FIXTURE,
  OCTOBER_2026_FIXTURE,
  belgiumVatDivisor,
  buildBelgiumObservation,
  getReferenceDate,
  inclPerLiterToExVatPer1000,
  observationFromIncl,
  parseBestatDayLabel,
  parseHistoryCsv,
  parseHistoryJson,
} from "./belgiumStatbelGasOilProvider.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const teunesenFixtures = JSON.parse(
  readFileSync(path.join(here, "../fixtures/teunesen-be-2026-validation.json"), "utf8"),
) as {
  applicableMonthToPrice: Record<string, number>;
  exactMatchMonths: string[];
  roundingToleranceMonths: Record<string, number>;
};

const historyFixtureJson = JSON.stringify({
  facts: [
    {
      "Jaar/Maand": "sep26",
      Dag: "15sep26",
      Productgroep: "Gasolie verwarming",
      Product: BELGIUM_PRODUCT,
      "Prijs incl. BTW": 1.5274,
    },
    {
      "Jaar/Maand": "okt26",
      Dag: "15okt26",
      Productgroep: "Gasolie verwarming",
      Product: BELGIUM_PRODUCT,
      "Prijs incl. BTW": 1.5666,
    },
    {
      "Jaar/Maand": "okt26",
      Dag: "15okt26",
      Productgroep: "Gasolie Diesel (verwarmingsdoeleinden)",
      Product: "Gasolie Diesel Verwarming (vanaf 2000 l) (€/L)",
      "Prijs incl. BTW": 1.5669,
    },
    {
      "Jaar/Maand": "aug26",
      Dag: "15aug26",
      Productgroep: "Gasolie verwarming",
      Product: BELGIUM_PRODUCT,
      "Prijs incl. BTW": 1.3187,
    },
  ],
});

const dayFixtureOtherDate = JSON.stringify({
  facts: [
    {
      Productgroep: "Gasolie verwarming",
      Product: BELGIUM_PRODUCT,
      Dag: "22okt26",
      "Prijs excl. BTW": 1.276,
      "Prijswijziging excl. BTW": -0,
      "Prijs incl. BTW": 1.544,
    },
  ],
});

const historyFixtureCsv = `"Jaar/Maand","Dag","Productgroep","Product","Prijs incl. BTW"
"okt26","15okt26","Gasolie verwarming","${BELGIUM_PRODUCT}",1.5666
"okt26","15okt26","Gasolie Diesel (verwarmingsdoeleinden)","Gasolie Diesel Verwarming (vanaf 2000 l) (€/L)",1.5669
"okt26","14okt26","Gasolie verwarming","${BELGIUM_PRODUCT}",1.5282`;

test("parseBestatDayLabel", () => {
  assert.equal(parseBestatDayLabel("15okt26"), "2026-10-15");
  assert.equal(parseBestatDayLabel("15sep26"), "2026-09-15");
  assert.equal(parseBestatDayLabel("01jan25"), "2025-01-01");
});

test("getReferenceDate maandlogica inclusief jaarwisseling", () => {
  assert.equal(getReferenceDate("2026-10"), "2026-09-15");
  assert.equal(getReferenceDate("2026-11"), "2026-10-15");
  assert.equal(getReferenceDate("2026-12"), "2026-11-15");
  assert.equal(getReferenceDate("2027-01"), "2026-12-15");
});

test("november 2026 fixture: 1.5666 incl -> 1294.70 ex/1000L -> 0.96", () => {
  const price = inclPerLiterToExVatPer1000(NOVEMBER_2026_FIXTURE.priceInclPerLiter);
  assert.equal(price, NOVEMBER_2026_FIXTURE.priceExVatPer1000Liters);
  assert.equal(calculateBelgiumSurcharge(price), NOVEMBER_2026_FIXTURE.surchargePerTon);
  const observation = observationFromIncl(
    NOVEMBER_2026_FIXTURE.referenceDate,
    NOVEMBER_2026_FIXTURE.priceInclPerLiter,
    "2026-10-21T12:00:00.000Z",
  );
  assert.equal(observation.applicableMonth, NOVEMBER_2026_FIXTURE.applicableMonth);
  assert.equal(observation.priceExVatPer1000Liters, 1294.7);
  assert.equal(observation.productLabel, BELGIUM_PRODUCT);
});

test("oktober 2026 fixture: 1.5274 incl -> 1262.30 ex/1000L -> 0.93", () => {
  const price = inclPerLiterToExVatPer1000(OCTOBER_2026_FIXTURE.priceInclPerLiter);
  assert.equal(price, OCTOBER_2026_FIXTURE.priceExVatPer1000Liters);
  assert.equal(calculateBelgiumSurcharge(price), OCTOBER_2026_FIXTURE.surchargePerTon);
  const range = staffelRangeFor("BE", price);
  assert.deepEqual(range, {
    from: OCTOBER_2026_FIXTURE.staffelFrom,
    to: OCTOBER_2026_FIXTURE.staffelTo,
  });
});

test("Diesel Verwarming product wijkt af van Teunesen novemberfixture", () => {
  const dieselVerw = inclPerLiterToExVatPer1000(1.5669);
  assert.notEqual(dieselVerw, 1294.7);
});

test("buildBelgiumObservation JSON-historie voor 15 okt en 15 sep", () => {
  const nov = buildBelgiumObservation({
    referenceDate: "2026-10-15",
    historyText: historyFixtureJson,
    dayText: dayFixtureOtherDate,
    retrievedAt: "2026-10-21T12:00:00.000Z",
  });
  assert.equal(nov.observation.priceExVatPer1000Liters, 1294.7);
  assert.equal(nov.vatStatus, "incl-converted");
  assert.equal(nov.diagnostics.sourceRecord?.dayLabel, "15okt26");
  assert.equal(nov.diagnostics.vatStatus, "incl-converted");

  const okt = buildBelgiumObservation({
    referenceDate: "2026-09-15",
    historyText: historyFixtureJson,
    dayText: dayFixtureOtherDate,
    retrievedAt: "2026-10-21T12:00:00.000Z",
  });
  assert.equal(okt.observation.priceExVatPer1000Liters, 1262.3);
  assert.equal(okt.observation.applicableMonth, "2026-10");
  assert.equal(okt.diagnostics.sourceRecord?.priceIncl, 1.5274);
});

test("ontbrekende peildatum: geen fallback", () => {
  assert.throws(
    () =>
      buildBelgiumObservation({
        referenceDate: "2026-01-15",
        historyText: historyFixtureJson,
        dayText: dayFixtureOtherDate,
        retrievedAt: "2026-10-21T12:00:00.000Z",
      }),
    /Geen be\.STAT-notering/,
  );
});

test("parseHistoryJson + CSV lezen productrijen", () => {
  assert.equal(parseHistoryJson(historyFixtureJson).length, 4);
  const rows = parseHistoryCsv(historyFixtureCsv);
  assert.equal(rows.length, 3);
  assert.equal(rows[0]?.isoDate, "2026-10-15");
});

test("BTW-divisor configureerbaar en gedocumenteerd default 1.21", () => {
  assert.equal(belgiumVatDivisor({}), 1.21);
  assert.equal(belgiumVatDivisor({ GASOIL_BE_VAT_DIVISOR: "1.21" }), 1.21);
  assert.throws(() => belgiumVatDivisor({ GASOIL_BE_VAT_DIVISOR: "0.5" }), /ongeldig/i);
});

test("H0/H7 vs Teunesen BE 2026 multi-month validatie", () => {
  const inclByReference: Record<string, number> = {
    "2025-12-15": 0.7317,
    "2026-01-15": 0.7542,
    "2026-02-15": 0.7624,
    "2026-03-15": 1.1771,
    "2026-04-15": 1.3267,
    "2026-05-15": 1.2507,
    "2026-06-15": 1.1029,
    "2026-07-15": 1.1712,
    "2026-08-15": 1.3187,
    "2026-09-15": 1.5274,
    "2026-10-15": 1.5666,
  };
  for (const [applicableMonth, expected] of Object.entries(teunesenFixtures.applicableMonthToPrice)) {
    const referenceDate = getReferenceDate(applicableMonth);
    const incl = inclByReference[referenceDate];
    assert.ok(incl != null, `missing incl for ${referenceDate}`);
    const actual = inclPerLiterToExVatPer1000(incl);
    const tol = teunesenFixtures.roundingToleranceMonths[applicableMonth] ?? 0;
    if (tol === 0) {
      assert.equal(actual, expected, `${applicableMonth} exact`);
    } else {
      const delta = Math.round(Math.abs(actual - expected) * 10) / 10;
      assert.ok(delta <= tol, `${applicableMonth} within ${tol} (actual=${actual})`);
    }
  }
  assert.equal(teunesenFixtures.exactMatchMonths.length >= 9, true);
});

test("BelgiumStatbelGasOilProvider fail-closed bij lege payload", async () => {
  const provider = new BelgiumStatbelGasOilProvider({
    fetchText: async () => "",
    now: () => new Date("2026-10-21T12:00:00+02:00"),
  });
  const outcome = await provider.getCurrentObservation();
  assert.equal(outcome.ok, false);
});

test("BelgiumStatbelGasOilProvider oktober peildatum 15 sep via historie-JSON", async () => {
  const provider = new BelgiumStatbelGasOilProvider({
    fetchText: async (url) => (url.includes("c42c9c16") ? dayFixtureOtherDate : historyFixtureJson),
    now: () => new Date("2026-10-21T12:00:00+02:00"),
  });
  const outcome = await provider.getCurrentObservation();
  assert.equal(outcome.ok, true);
  if (outcome.ok) {
    assert.equal(outcome.observation.referenceDate, "2026-09-15");
    assert.equal(outcome.observation.applicableMonth, "2026-10");
    assert.equal(outcome.observation.priceExVatPer1000Liters, 1262.3);
    assert.equal(outcome.observation.source, "bestat-statbel");
    assert.equal(outcome.observation.sourceLabel, "be.STAT / FOD Economie");
  }
  const nov = await provider.getObservationForApplicableMonth("2026-11");
  assert.equal(nov.ok, true);
  if (nov.ok) {
    assert.equal(nov.observation.priceExVatPer1000Liters, 1294.7);
    assert.equal(nov.diagnostics.productIdentifier, BELGIUM_PRODUCT);
  }
});
