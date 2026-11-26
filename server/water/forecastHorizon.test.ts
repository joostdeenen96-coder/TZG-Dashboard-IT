import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  MAX_FORECAST_HORIZON_DAYS,
  capForecastHorizon,
  formatHorizonDay,
  outlookCaption,
  thinPoints,
} from "../../src/lib/waterForecast.ts";
import { getWaterLevels } from "../services/waterLevelService.ts";
import type { WaterStationResult } from "../providers/waterLevelProvider.ts";

const now = new Date("2026-11-01T12:00:00Z");

function point(day: string, kind: "verwacht" | "inschatting" = "verwacht") {
  return { timestamp: `${day}T06:00:00Z`, levelCm: 300, kind };
}

function daysFrom(start: string, count: number) {
  const [year, month, day] = start.split("-").map(Number);
  return Array.from({ length: count }, (_, index) => {
    const cursor = new Date(Date.UTC(year!, month! - 1, day! + index));
    const key = cursor.toISOString().slice(0, 10);
    return point(key);
  });
}

test("zes weken officiële punten blijven in het venster, een langere reeks niet", () => {
  const six = daysFrom("2026-11-02", 42);
  const horizon = capForecastHorizon(six, now, "absolute");
  assert.equal(horizon.dayCount, 42);
  assert.equal(horizon.reachesSixWeeks, true);
  assert.equal(horizon.points.length, 42);
  assert.equal(horizon.endKey, "2026-12-13");
  assert.equal(horizon.points.at(-1)?.timestamp, six.at(-1)?.timestamp);

  const longer = daysFrom("2026-11-02", 50);
  const capped = capForecastHorizon(longer, now, "absolute");
  assert.equal(capped.dayCount, MAX_FORECAST_HORIZON_DAYS);
  assert.equal(capped.points.length, 42);
  assert.equal(capped.endKey, "2026-12-13");
  assert.equal(capped.points.at(-1)?.timestamp, "2026-12-13T06:00:00Z");
});

test("een kortere horizon wordt niet aangevuld", () => {
  const short = daysFrom("2026-11-02", 10);
  const horizon = capForecastHorizon(short, now, "absolute");
  assert.equal(horizon.dayCount, 10);
  assert.equal(horizon.points.length, 10);
  assert.equal(horizon.endKey, "2026-11-11");
  assert.equal(horizon.reachesSixWeeks, false);
  assert.equal(outlookCaption(horizon).includes("6 weken"), false);
  assert.match(outlookCaption(horizon), /Horizon tot/);
  assert.match(outlookCaption(horizon), /niet beschikbaar/);
});

test("verwacht en inschatting blijven uit elkaar, en een lege reeks laat de meting met rust", () => {
  const mixed = [
    point("2026-11-02", "verwacht"),
    point("2026-11-03", "inschatting"),
  ];
  const horizon = capForecastHorizon(mixed, now, "absolute");
  assert.deepEqual(
    horizon.points.map((item) => item.kind),
    ["verwacht", "inschatting"],
  );
  const measured = [{ timestamp: "2026-11-01T08:00:00Z", levelCm: 280 }];
  const empty = capForecastHorizon([], now, "absolute");
  assert.equal(empty.points.length, 0);
  assert.equal(measured[0]?.levelCm, 280);
  assert.equal(outlookCaption(empty), "Zesweekse verwachting niet beschikbaar");
});

test("een verouderde horizon wordt zo genoemd", () => {
  const horizon = capForecastHorizon([point("2026-11-04")], now, "absolute");
  assert.match(outlookCaption(horizon, true), /Verouderd/);
  assert.equal(outlookCaption(horizon, false).includes("Verouderd"), false);
});

test("een punt na middernacht UTC valt op de Amsterdamse datum", () => {
  const horizon = capForecastHorizon(
    [{ timestamp: "2026-11-26T23:30:00Z", levelCm: 310, kind: "verwacht" }],
    new Date("2026-11-26T12:00:00Z"),
    "absolute",
  );
  assert.equal(horizon.endKey, "2026-11-27");
  assert.match(formatHorizonDay("2026-11-27"), /27/);
  assert.match(formatHorizonDay("2026-11-27"), /2026/);
});

test("uitdunnen houdt het eerste en laatste punt", () => {
  const points = daysFrom("2026-11-02", 42);
  const thin = thinPoints(points, 8);
  assert.equal(thin.length, 8);
  assert.equal(thin[0]?.timestamp, points[0]?.timestamp);
  assert.equal(thin.at(-1)?.timestamp, points.at(-1)?.timestamp);
});

test("de grafiek onderscheidt meting, voorspelling en inschatting", () => {
  const chart = readFileSync(new URL("../../src/components/WaterChart.tsx", import.meta.url), "utf8");
  assert.match(chart, /data-water-measured-line/);
  assert.match(chart, /stroke-water/);
  assert.match(chart, /data-water-forecast-line/);
  assert.match(chart, /stroke-gold/);
  assert.match(chart, /strokeDasharray="6 4"/);
  assert.match(chart, /data-water-estimate-line/);
  assert.match(chart, /stroke-mist/);
  assert.match(chart, /strokeDasharray="2 4"/);
});

test("een defect station blokkeert de andere stations niet", async () => {
  const ok = (id: "kaub" | "ruhrort", levelCm: number): WaterStationResult => ({
    id,
    name: id,
    river: "Rijn",
    levelCm,
    changeCm: 0,
    trend: "gelijk",
    status: "Normaal",
    severity: "normal",
    updatedAt: "2026-11-26T08:00:00Z",
    source: "PEGELONLINE",
    series: [{ timestamp: "2026-11-26T08:00:00Z", levelCm }],
    forecast: [],
    forecastError: null,
    graphPath: null,
    error: null,
  });
  const levels = await getWaterLevels({
    kaub: { getCurrentData: async () => ok("kaub", 155) },
    ruhrort: { getCurrentData: async () => ok("ruhrort", 240) },
    maxau: { getCurrentData: async () => Promise.reject(new Error("RLP weg")) },
  });
  assert.equal(levels.kaub.levelCm, 155);
  assert.equal(levels.kaub.forecast.length, 0);
  assert.equal(levels.ruhrort.levelCm, 240);
  assert.equal(levels.maxau.error, "RLP weg");
  assert.equal(levels.maxau.levelCm, null);
});
