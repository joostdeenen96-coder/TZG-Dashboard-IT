import assert from "node:assert/strict";
import test from "node:test";
import { calculateBelgiumSurcharge } from "../staffelEngine.js";
import {
  BELGIUM_PRODUCT,
  BelgiumStatbelGasOilProvider,
  NOVEMBER_2026_FIXTURE,
  buildBelgiumObservation,
  inclPerLiterToExVatPer1000,
  observationFromIncl,
  parseBestatDayLabel,
  parseHistoryCsv,
} from "./belgiumStatbelGasOilProvider.js";

const historyFixture = `"Jaar/Maand","Dag","Productgroep","Product","Prijs incl. BTW"
"okt26","15okt26","Gasolie verwarming","${BELGIUM_PRODUCT}",1.5666
"okt26","15okt26","Gasolie Diesel (verwarmingsdoeleinden)","Gasolie Diesel Verwarming (vanaf 2000 l) (€/L)",1.5669
"okt26","14okt26","Gasolie verwarming","${BELGIUM_PRODUCT}",1.5282`;

const dayFixtureOtherDate = `"Productgroep","Product","Dag","Prijs excl. BTW","Prijswijziging excl. BTW","Prijs incl. BTW"
"Gasolie verwarming","${BELGIUM_PRODUCT}","22okt26",1.276,-0,1.544`;

test("parseBestatDayLabel", () => {
  assert.equal(parseBestatDayLabel("15okt26"), "2026-10-15");
  assert.equal(parseBestatDayLabel("01jan25"), "2025-01-01");
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

test("Diesel Verwarming product wijkt af van Teunesen novemberfixture", () => {
  const dieselVerw = inclPerLiterToExVatPer1000(1.5669);
  assert.notEqual(dieselVerw, 1294.7);
});

test("buildBelgiumObservation gebruikt historie incl-pad voor peildatum 15 okt", () => {
  const observation = buildBelgiumObservation({
    referenceDate: "2026-10-15",
    historyCsv: historyFixture,
    dayCsv: dayFixtureOtherDate,
    retrievedAt: "2026-10-21T12:00:00.000Z",
  });
  assert.equal(observation.priceExVatPer1000Liters, 1294.7);
  assert.equal(observation.productLabel, BELGIUM_PRODUCT);
});

test("parseHistoryCsv leest productrijen", () => {
  const rows = parseHistoryCsv(historyFixture);
  assert.equal(rows.length, 3);
  assert.equal(rows[0]?.isoDate, "2026-10-15");
});

test("BelgiumStatbelGasOilProvider fail-closed bij lege CSV", async () => {
  const provider = new BelgiumStatbelGasOilProvider({
    fetchText: async () => "",
    now: () => new Date("2026-10-21T12:00:00+02:00"),
  });
  const outcome = await provider.getCurrentObservation();
  assert.equal(outcome.ok, false);
});

test("BelgiumStatbelGasOilProvider succes met fixture-CSV", async () => {
  const provider = new BelgiumStatbelGasOilProvider({
    fetchText: async (url) => (url.includes("c42c9c16") ? dayFixtureOtherDate : historyFixture),
    now: () => new Date("2026-11-05T12:00:00+01:00"),
  });
  const outcome = await provider.getCurrentObservation();
  assert.equal(outcome.ok, true);
  if (outcome.ok) {
    assert.equal(outcome.observation.referenceDate, "2026-10-15");
    assert.equal(outcome.observation.applicableMonth, "2026-11");
    assert.equal(outcome.observation.priceExVatPer1000Liters, 1294.7);
    assert.equal(outcome.observation.source, "bestat-statbel");
  }
});
