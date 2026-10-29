import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { MaxauProvider, resetMaxauProviderForTests, setMaxauProviderForTests } from "../providers/maxauProvider.js";
import { setMaxauForecastFetchForTests } from "../providers/rlpMaxauForecast.js";
import { applyMeasuredStatus, classifyWaterLevel, type WaterStatusLabel } from "./classifyWaterLevel.js";

const kaub: Array<[number, WaterStatusLabel]> = [
  [79, "Extreem laag"],
  [80, "Zeer laag"],
  [129, "Zeer laag"],
  [130, "Laag"],
  [179, "Laag"],
  [180, "Normaal"],
  [279, "Normaal"],
  [280, "Hoog"],
  [379, "Hoog"],
  [380, "Zeer hoog"],
];

const maxau: Array<[number, WaterStatusLabel]> = [
  [299, "Extreem laag"],
  [300, "Zeer laag"],
  [374, "Zeer laag"],
  [375, "Laag"],
  [449, "Laag"],
  [450, "Normaal"],
  [549, "Normaal"],
  [550, "Hoog"],
  [649, "Hoog"],
  [650, "Zeer hoog"],
];

const ruhrort: Array<[number, WaterStatusLabel]> = [
  [199, "Extreem laag"],
  [200, "Zeer laag"],
  [249, "Zeer laag"],
  [250, "Laag"],
  [299, "Laag"],
  [300, "Normaal"],
  [399, "Normaal"],
  [400, "Hoog"],
  [449, "Hoog"],
  [450, "Zeer hoog"],
];

test("WL1-WL4 grenzen van Kaub, Maxau en Ruhrort sluiten op elkaar aan", () => {
  for (const [level, label] of kaub) {
    assert.equal(classifyWaterLevel("kaub", level)?.label, label, `kaub ${level}`);
  }
  for (const [level, label] of maxau) {
    assert.equal(classifyWaterLevel("maxau", level)?.label, label, `maxau ${level}`);
  }
  for (const [level, label] of ruhrort) {
    assert.equal(classifyWaterLevel("ruhrort", level)?.label, label, `ruhrort ${level}`);
  }
});

test("elke centimeter hoort bij precies één klasse", () => {
  const spans = [
    ["kaub", 0, 500],
    ["maxau", 0, 800],
    ["ruhrort", 0, 600],
  ] as const;
  for (const [station, from, to] of spans) {
    for (let level = from; level <= to; level += 1) {
      const classified = classifyWaterLevel(station, level);
      assert.ok(classified, `${station} ${level}`);
      assert.equal(classifyWaterLevel(station, level)?.label, classified.label);
    }
  }
});

test("WL13 ontbrekende of ongeldige meting krijgt geen klasse", () => {
  assert.equal(classifyWaterLevel("kaub", null), null);
  assert.equal(classifyWaterLevel("maxau", undefined), null);
  assert.equal(classifyWaterLevel("ruhrort", Number.NaN), null);
  assert.equal(classifyWaterLevel("kaub", Number.POSITIVE_INFINITY), null);
  assert.throws(() => applyMeasuredStatus("kaub", { levelCm: Number.NaN }), /ongeldig/);
});

test("WL11-WL12 alleen de gemeten stand bepaalt de badge", () => {
  const forecastCm = 650;
  const measured = applyMeasuredStatus("kaub", { levelCm: 155, forecastCm });
  assert.equal(measured.status, "Laag");
  assert.equal(measured.severity, "low");
  assert.equal(measured.forecastCm, forecastCm);
  assert.equal(applyMeasuredStatus("maxau", { levelCm: 155 }).status, "Extreem laag");
  assert.equal(applyMeasuredStatus("ruhrort", { levelCm: 155 }).status, "Extreem laag");
});

test("WL12 Maxau-forecast verandert de statusbadge niet", async () => {
  resetMaxauProviderForTests();
  setMaxauProviderForTests({
    now: () => 1_000,
    readLevel: async () => ({
      levelCm: 155,
      changeCm: -4,
      trend: "dalend",
      status: "Normaal",
      updatedAt: "2026-10-26T14:30:00+01:00",
    }),
    readChart: async () => ({
      history: [],
      series: [
        { timestamp: "2026-10-26T12:00:00Z", levelCm: 159 },
        { timestamp: "2026-10-26T14:30:00Z", levelCm: 155 },
      ],
      forecast: [],
      forecastError: null,
    }),
  });
  setMaxauForecastFetchForTests(async () => ({
    W: {
      predictions: {
        time: "2026-10-26T12:00:00Z",
        nextUpdateTime: "2026-10-26T15:15:00Z",
        p50: [
          { x: "2026-10-26T15:00:00Z", y: 620 },
          { x: "2026-10-26T16:00:00Z", y: 680 },
        ],
      },
    },
  }));
  try {
    const station = await new MaxauProvider().getCurrentData();
    assert.equal(station.levelCm, 155);
    assert.equal(station.status, "Extreem laag");
    assert.equal(station.severity, "extreme-low");
    assert.equal(station.forecastStatus, "ok");
    assert.ok((station.forecast[0]?.levelCm ?? 0) >= 620);
    assert.equal(station.forecastClock, "absolute");
  } finally {
    setMaxauForecastFetchForTests(null);
    resetMaxauProviderForTests();
  }
});

test("WL17-WL19 forecastpaden blijven aanwezig en de grafiekkleur volgt de status niet", () => {
  const root = new URL("../", import.meta.url);
  const pegel = readFileSync(new URL("./providers/pegelonline.ts", root), "utf8");
  const maxau = readFileSync(new URL("./providers/maxauProvider.ts", root), "utf8");
  const kaub = readFileSync(new URL("./providers/kaubProvider.ts", root), "utf8");
  const ruhrort = readFileSync(new URL("./providers/ruhrortProvider.ts", root), "utf8");
  const chart = readFileSync(new URL("../src/components/WaterChart.tsx", root), "utf8");
  const card = readFileSync(new URL("../src/components/WaterLevelCard.tsx", root), "utf8");
  const css = readFileSync(new URL("../src/index.css", root), "utf8");
  assert.equal(pegel.includes("function readForecast"), true);
  assert.equal(pegel.includes("stateMnwMhw"), false);
  assert.equal(maxau.includes("readMaxauForecast"), true);
  assert.equal(kaub.includes("applyMeasuredStatus(\"kaub\", reading)"), true);
  assert.equal(ruhrort.includes("applyMeasuredStatus(\"ruhrort\", reading)"), true);
  assert.equal(chart.includes("stroke-gold"), true);
  assert.equal(chart.includes("severity"), false);
  assert.equal(chart.includes("data-water-status"), false);
  assert.equal(card.includes("data-water-severity={station.severity}"), true);
  for (const severity of ["extreme-low", "very-low", "low", "normal", "high", "very-high"]) {
    assert.equal(css.includes(`data-water-severity="${severity}"`), true, severity);
  }
  assert.equal(css.includes("--color-water-critical"), true);
  assert.equal(css.includes("--color-water-low"), true);
  assert.match(css, /data-water-severity="normal"[\s\S]*--color-gold/);
});
