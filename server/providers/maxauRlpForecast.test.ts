import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { formatAmsterdamTime, formatPublicationDate } from "../../src/lib/format.ts";
import {
  alignForecast,
  displayMillis,
  forecastClockFor,
  formatWaterPointTooltip,
  selectDailyForecast,
} from "../../src/lib/waterForecast.ts";
import type { WaterForecastPoint } from "./waterLevelProvider.ts";
import {
  MAXAU_MEASUREMENT_FRESH_MS,
  MAXAU_MEASUREMENT_STALE_MS,
  MaxauProvider,
  resetMaxauProviderForTests,
  setMaxauProviderForTests,
} from "./maxauProvider.ts";
import {
  MAXAU_FORECAST_FRESH_MS,
  MAXAU_FORECAST_SOURCE,
  MAXAU_FORECAST_STALE_MS,
  MAXAU_RLP_CONFIG_URL,
  MAXAU_RLP_PAGE_URL,
  MAXAU_RLP_URL,
  clipForecastAfterMeasurement,
  parseRlpMaxauForecast,
  readMaxauForecast,
  setMaxauForecastClockForTests,
  setMaxauForecastFetchForTests,
} from "./rlpMaxauForecast.ts";

test.beforeEach(() => {
  resetMaxauProviderForTests();
});

test.afterEach(() => {
  resetMaxauProviderForTests();
});

function point(timestamp: string, levelCm: number): WaterForecastPoint {
  return { timestamp, levelCm, kind: "verwacht" };
}

test("M4-M7 parser gebruikt alleen W.predictions.p50", () => {
  const parsed = parseRlpMaxauForecast({
    Q: { yLast: 9999, predictions: { p50: [{ x: "2026-10-26T15:00:00Z", y: 1 }], time: "2026-10-26T12:00:00Z" } },
    W: {
      measurements: [{ x: "2026-10-26T14:30:00Z", y: 111 }],
      predictions: {
        time: "2026-10-26T12:00:00Z",
        nextUpdateTime: "2026-10-26T15:15:00Z",
        p10: [{ x: "2026-10-26T15:00:00Z", y: 100 }],
        p50: [
          { x: "2026-10-26T16:00:00Z", y: 345 },
          { x: "2026-10-26T15:00:00Z", y: 344 },
          { x: "geen-tijd", y: 1 },
          { x: "2026-10-26T15:00:00Z", y: 999 },
          { x: "2026-10-26T17:00:00Z", y: Number.NaN },
          { x: "2026-10-26T18:00:00Z", y: Number.POSITIVE_INFINITY },
          { x: "2026-10-26T17:00:00Z", y: 330.4 },
        ],
      },
    },
  });
  assert.deepEqual(
    parsed.points.map((item) => [item.timestamp, item.levelCm, item.kind]),
    [
      ["2026-10-26T15:00:00Z", 344, "verwacht"],
      ["2026-10-26T16:00:00Z", 345, "verwacht"],
      ["2026-10-26T17:00:00Z", 330, "verwacht"],
    ],
  );
  assert.equal(parsed.issuedAt, "2026-10-26T12:00:00Z");
  assert.equal(parsed.nextUpdateAt, "2026-10-26T15:15:00Z");
  assert.equal(parsed.points.some((item) => item.levelCm === 111 || item.levelCm === 9999 || item.levelCm === 1), false);
});

test("MX6-MX11 de hele p50-reeks blijft Vorhersage, zonder daglimiet of Abschätzung", () => {
  const start = Date.parse("2026-10-26T15:00:00Z");
  const p50 = Array.from({ length: 120 }, (_, hour) => ({
    x: new Date(start + hour * 3_600_000).toISOString(),
    y: 340,
  }));
  const parsed = parseRlpMaxauForecast({
    W: {
      measurements: [{ x: "2026-10-26T14:00:00Z", y: 111 }],
      predictions: {
        time: "2026-10-26T12:00:00Z",
        p10: [{ x: "2026-10-31T15:00:00Z", y: 1 }],
        p90: [{ x: "2026-10-31T15:00:00Z", y: 999 }],
        p50,
      },
    },
  });
  assert.equal(parsed.points.length, 120);
  assert.equal(parsed.points.every((point) => point.kind === "verwacht"), true);
  assert.equal(parsed.points.some((point) => point.kind === "inschatting"), false);
  assert.equal(parsed.points[0]?.timestamp, new Date(start).toISOString());
  assert.equal(parsed.points.at(-1)?.timestamp, new Date(start + 119 * 3_600_000).toISOString());
  assert.equal(parsed.points.some((point) => point.levelCm === 111 || point.levelCm === 1 || point.levelCm === 999), false);

  const days = selectDailyForecast(parsed.points, new Date("2026-10-26T12:00:00Z"), "absolute");
  assert.equal(days.length, 5);
  assert.equal(days.every((point) => point.kind === "verwacht"), true);
});

test("M10-M11 voorspelling blijft chronologisch en zonder dubbele tijdstippen", () => {
  const parsed = parseRlpMaxauForecast({
    W: {
      predictions: {
        time: "2026-10-26T12:00:00.000Z",
        p50: [
          { x: "2026-10-26T18:00:00Z", y: 330 },
          { x: "2026-10-26T16:00:00.000Z", y: 332 },
          { x: "2026-10-26T16:00:00Z", y: 999 },
          { x: "2026-10-26T17:00:00Z", y: 331 },
        ],
      },
    },
  });
  const times = parsed.points.map((item) => Date.parse(item.timestamp));
  assert.deepEqual(times, [...times].sort((left, right) => left - right));
  assert.equal(new Set(times).size, times.length);
  assert.equal(parsed.points.find((item) => Date.parse(item.timestamp) === Date.parse("2026-10-26T16:00:00Z"))?.levelCm, 332);
});

test("M15-M18 forecastcache: vers, stale, unavailable en herstel", async () => {
  let now = 1_000_000;
  let mode: "ok" | "fail" = "ok";
  let level = 344;
  let fetches = 0;
  setMaxauForecastClockForTests(() => now);
  setMaxauForecastFetchForTests(async (url) => {
    fetches += 1;
    assert.equal(url, MAXAU_RLP_URL);
    if (mode === "fail") throw new Error("bron weg");
    return {
      W: {
        predictions: {
          time: "2026-10-26T12:00:00Z",
          p50: [
            { x: "2026-10-26T15:00:00Z", y: level },
            { x: "2026-10-26T16:00:00Z", y: level + 1 },
          ],
        },
      },
    };
  });

  const first = await readMaxauForecast();
  const second = await readMaxauForecast();
  assert.equal(first.status, "ok");
  assert.equal(second.points[0]?.levelCm, 344);
  assert.equal(second.status, "ok");
  assert.equal(fetches, 1);

  now += MAXAU_FORECAST_FRESH_MS + 1;
  mode = "fail";
  const stale = await readMaxauForecast();
  assert.equal(stale.status, "stale");
  assert.equal(stale.message, "Voorspelling tijdelijk niet vernieuwd.");
  assert.equal(stale.points[0]?.levelCm, 344);
  assert.equal(stale.issuedAt, "2026-10-26T12:00:00Z");

  now += MAXAU_FORECAST_STALE_MS;
  const gone = await readMaxauForecast();
  assert.equal(gone.status, "unavailable");
  assert.deepEqual(gone.points, []);

  mode = "ok";
  level = 350;
  const recovered = await readMaxauForecast();
  assert.equal(recovered.status, "ok");
  assert.equal(recovered.points[0]?.levelCm, 350);
});

test("M13-M16 Maxau-provider koppelt p50 ná de meting en bewaart de waterstand", async () => {
  let now = 5_000_000;
  let levelCalls = 0;
  let levelFails = false;
  let forecastFails = false;
  const reading = {
    levelCm: 342,
    changeCm: 2,
    trend: "stijgend" as const,
    status: "normaal" as const,
    updatedAt: "2026-10-26T14:30:00+01:00",
  };
  setMaxauProviderForTests({
    now: () => now,
    readLevel: async () => {
      levelCalls += 1;
      if (levelFails) throw new Error("HVZ weg");
      return reading;
    },
    readChart: async () => ({
      history: [],
      series: [
        { timestamp: "2026-10-26T12:00:00Z", levelCm: 338 },
        { timestamp: "2026-10-26T14:30:00Z", levelCm: 342 },
      ],
      forecast: [],
      forecastError: null,
    }),
  });
  setMaxauForecastFetchForTests(async () => {
    if (forecastFails) throw new Error("RLP weg");
    return {
      W: {
        predictions: {
          time: "2026-10-26T12:00:00Z",
          nextUpdateTime: "2026-10-26T15:15:00Z",
          p50: [
            { x: "2026-10-26T13:00:00Z", y: 340 },
            { x: "2026-10-26T14:30:00Z", y: 342 },
            { x: "2026-10-26T15:00:00Z", y: 344 },
            { x: "2026-10-26T16:00:00Z", y: 345 },
          ],
        },
      },
    };
  });

  const first = await new MaxauProvider().getCurrentData();
  assert.equal(first.levelCm, 342);
  assert.equal(first.error, null);
  assert.equal(first.forecastClock, "absolute");
  assert.equal(first.forecastStatus, "ok");
  assert.equal(first.forecastIssuedAt, "2026-10-26T12:00:00Z");
  assert.equal(first.forecastSource, MAXAU_FORECAST_SOURCE);
  assert.equal(first.forecastStationId, "23700200");
  assert.deepEqual(
    first.forecast.map((item) => item.timestamp),
    ["2026-10-26T15:00:00Z", "2026-10-26T16:00:00Z"],
  );
  assert.equal(first.forecastValidFrom, "2026-10-26T15:00:00Z");
  assert.equal(first.forecastValidTo, "2026-10-26T16:00:00Z");
  assert.equal(first.forecastError, null);
  assert.equal(first.graphPath, null);

  const cached = await new MaxauProvider().getCurrentData();
  assert.equal(levelCalls, 1);
  assert.equal(cached.levelCm, 342);
  assert.equal(cached.forecastStatus, "ok");

  now += MAXAU_MEASUREMENT_FRESH_MS + 1;
  forecastFails = true;
  const stale = await new MaxauProvider().getCurrentData();
  assert.equal(stale.levelCm, 342);
  assert.equal(stale.error, null);
  assert.equal(stale.forecastStatus, "stale");
  assert.equal(stale.forecast[0]?.levelCm, 344);
  assert.equal(stale.forecastError, "Voorspelling tijdelijk niet vernieuwd.");

  const forecastExpiredAt = 5_000_000 + MAXAU_FORECAST_STALE_MS + 1;
  now = forecastExpiredAt;
  const empty = await new MaxauProvider().getCurrentData();
  assert.equal(empty.levelCm, 342);
  assert.deepEqual(empty.forecast, []);
  assert.equal(empty.forecastStatus, "unavailable");
  assert.equal(empty.forecastError, null);

  levelFails = true;
  now = forecastExpiredAt + MAXAU_MEASUREMENT_STALE_MS + 1;
  const down = await new MaxauProvider().getCurrentData();
  assert.equal(down.levelCm, null);
  assert.equal(down.error, "HVZ weg");
});

test("overlap met de meetreeks levert geen forecast op", () => {
  const clipped = clipForecastAfterMeasurement(
    [point("2026-10-26T14:00:00Z", 340), point("2026-10-26T15:00:00Z", 344)],
    [{ timestamp: "2026-10-26T14:30:00Z", levelCm: 342 }],
    "2026-10-26T14:30:00Z",
  );
  assert.deepEqual(clipped, []);
});

test("M9 geen dubbele CET/CEST-conversie rond de wintertijd van 2026", () => {
  assert.equal(formatAmsterdamTime("2026-10-24T22:00:00.000Z"), "00:00");
  assert.equal(formatPublicationDate("2026-10-24T22:00:00.000Z"), "25 oktober 2026");
  assert.equal(formatAmsterdamTime("2026-10-25T00:30:00.000Z"), "02:30");
  assert.equal(formatAmsterdamTime("2026-10-25T01:00:00.000Z"), "02:00");
  assert.equal(formatAmsterdamTime("2026-10-25T02:00:00.000Z"), "03:00");
  const tooltip = formatWaterPointTooltip("Maxau", "Voorspelling", "2026-10-24T22:00:00.000Z", 344);
  assert.deepEqual(tooltip.split("\n"), ["Maxau", "Voorspelling", "25 oktober 2026", "00:00", "344 cm"]);
  const measured = formatWaterPointTooltip("Maxau", "Gemeten", "2026-10-26T14:30:00Z", 342);
  assert.deepEqual(measured.split("\n"), ["Maxau", "Gemeten", "26 oktober 2026", "15:30", "342 cm"]);
});

test("M19-M22 grafiekklok: Maxau absoluut, Kaub en Ruhrort een dag vooruit", () => {
  assert.equal(forecastClockFor({ id: "maxau" }), "absolute");
  assert.equal(forecastClockFor({ id: "kaub" }), "shifted");
  assert.equal(forecastClockFor({ id: "ruhrort" }), "shifted");
  assert.equal(forecastClockFor({ id: "maxau", forecastClock: "shifted" }), "shifted");
  assert.equal(forecastClockFor({ id: "kaub", forecastClock: "absolute" }), "absolute");

  const samples = [point("2026-10-26T06:00:00Z", 120), point("2026-10-27T06:00:00Z", 130)];
  const after = Date.parse("2026-10-26T14:00:00Z");
  const shifted = alignForecast(samples, after, "shifted");
  assert.deepEqual(
    shifted.map((item) => item.timestamp),
    [new Date(Date.parse("2026-10-26T06:00:00Z") + 86_400_000).toISOString(), new Date(Date.parse("2026-10-27T06:00:00Z") + 86_400_000).toISOString()],
  );
  assert.equal(shifted[0]?.levelCm, 120);
  const absolute = alignForecast(samples, after, "absolute");
  assert.deepEqual(
    absolute.map((item) => item.timestamp),
    ["2026-10-27T06:00:00Z"],
  );
  assert.equal(displayMillis("2026-10-26T15:00:00Z", "absolute"), Date.parse("2026-10-26T15:00:00Z"));
  assert.equal(displayMillis("2026-10-26T15:00:00Z", "shifted"), Date.parse("2026-10-26T15:00:00Z") + 86_400_000);

  const days = selectDailyForecast(samples, new Date("2026-10-26T12:00:00Z"), "absolute");
  assert.deepEqual(days.map((item) => item.timestamp), ["2026-10-27T06:00:00Z"]);
  const kaubDays = selectDailyForecast([point("2026-10-26T06:00:00Z", 80)], new Date("2026-10-26T12:00:00Z"), "shifted");
  assert.equal(kaubDays.length, 1);
  assert.equal(kaubDays[0]?.levelCm, 80);
});

test("M14 M19 M20 M26 API, grafiekfamilie en player blijven gedeeld", () => {
  const route = readFileSync(new URL("../routes/waterLevels.ts", import.meta.url), "utf8");
  const chart = readFileSync(new URL("../../src/components/WaterChart.tsx", import.meta.url), "utf8");
  const card = readFileSync(new URL("../../src/components/WaterLevelCard.tsx", import.meta.url), "utf8");
  const player = readFileSync(new URL("../../src/pages/PlayerPage.tsx", import.meta.url), "utf8");
  const display = readFileSync(new URL("../../src/pages/DisplayPage.tsx", import.meta.url), "utf8");
  const kaub = readFileSync(new URL("./kaubProvider.ts", import.meta.url), "utf8");
  const ruhrort = readFileSync(new URL("./ruhrortProvider.ts", import.meta.url), "utf8");
  assert.match(route, /waterLevelsRouter\.get\("\/"/);
  assert.match(route, /getWaterLevels\(\)/);
  assert.equal(route.includes("forecast: []"), false);
  assert.match(chart, /className="stroke-water"/);
  assert.match(chart, /className="stroke-gold"/);
  assert.match(chart, /strokeDasharray="6 4"/);
  assert.equal(chart.includes("maxau"), false);
  assert.match(card, /forecastClockFor\(station\)/);
  assert.match(card, /data-water-forecast-kind/);
  assert.match(player, /DashboardCanvas/);
  assert.equal(player.includes("forecastClock"), false);
  assert.match(display, /waterlevels/);
  assert.equal(kaub.includes("forecastClock"), false);
  assert.equal(ruhrort.includes("forecastClock"), false);
});

test("M1-M11 officiële RLP-route levert numerieke Maxau-voorspelling", { timeout: 45_000 }, async () => {
  const page = await fetch(MAXAU_RLP_PAGE_URL);
  assert.equal(page.status, 200);
  const html = await page.text();
  const script = html.match(/src="(\/assets\/index-[^"]+\.js)"/);
  assert.ok(script?.[1]);
  const bundle = await fetch(new URL(script[1], MAXAU_RLP_PAGE_URL));
  assert.equal(bundle.status, 200);
  const source = await bundle.text();
  assert.match(source, /\/api\/v1/);
  assert.match(source, /measurement-site/);

  const configResponse = await fetch(MAXAU_RLP_CONFIG_URL);
  assert.equal(configResponse.status, 200);
  const config = (await configResponse.json()) as {
    measurementsite?: Record<string, { name?: string; number?: string; slug?: string; legendText?: string; legendURL?: string }>;
    slugs?: { oberrhein?: { measurementsites?: { maxau?: { ms_number?: number; name?: string } } } };
  };
  const station = config.measurementsite?.["23700200"];
  assert.equal(station?.name, "Maxau");
  assert.equal(station?.number, "23700200");
  assert.equal(station?.slug, "maxau");
  assert.equal(station?.legendText, "Vorhersage der HVZ Baden-Württemberg");
  assert.match(station?.legendURL ?? "", /hvz\.baden-wuerttemberg\.de\/pegel\.html\?id=09016/);
  assert.equal(config.slugs?.oberrhein?.measurementsites?.maxau?.ms_number, 23700200);
  assert.equal(config.slugs?.oberrhein?.measurementsites?.maxau?.name, "Maxau");

  const siteResponse = await fetch(MAXAU_RLP_URL);
  assert.equal(siteResponse.status, 200);
  const site = (await siteResponse.json()) as {
    Q?: { yLast?: number };
    W?: { measurements?: Array<{ x?: string; y?: number }>; predictions?: { time?: string; p50?: Array<{ x?: string; y?: number }> } };
  };
  const parsed = parseRlpMaxauForecast(site);
  const official = new Map<number, number>();
  for (const row of site.W?.predictions?.p50 ?? []) {
    if (typeof row.x !== "string" || typeof row.y !== "number" || !Number.isFinite(row.y)) continue;
    const epoch = Date.parse(row.x);
    if (!Number.isFinite(epoch) || official.has(epoch)) continue;
    official.set(epoch, Math.round(row.y));
  }
  assert.ok(official.size >= 2);
  assert.equal(parsed.points.length, official.size);
  assert.equal(parsed.issuedAt, site.W?.predictions?.time);
  assert.equal(parsed.points.every((item) => item.kind === "verwacht"), true);
  assert.equal(parsed.points.some((item) => item.kind === "inschatting"), false);
  for (const item of parsed.points) {
    assert.equal(item.kind, "verwacht");
    assert.equal(Number.isFinite(item.levelCm), true);
    assert.equal(item.levelCm, official.get(Date.parse(item.timestamp)));
  }
  assert.notEqual(site.Q?.yLast, parsed.points[0]?.levelCm);
  for (let index = 1; index < parsed.points.length; index += 1) {
    assert.ok(Date.parse(parsed.points[index].timestamp) > Date.parse(parsed.points[index - 1].timestamp));
  }
  const future = parsed.points.filter((item) => Date.parse(item.timestamp) > Date.now());
  assert.ok(future.length >= 2);

  const live = await new MaxauProvider().getCurrentData();
  assert.equal(live.error, null);
  assert.equal(typeof live.levelCm, "number");
  assert.equal(live.forecastClock, "absolute");
  assert.equal(live.forecastStatus, "ok");
  assert.equal(live.forecastSource, MAXAU_FORECAST_SOURCE);
  assert.equal(live.forecastStationId, "23700200");
  assert.equal(live.forecastIssuedAt, site.W?.predictions?.time);
  assert.ok(live.forecast.length >= 2);
  const lastMeasured = Math.max(
    ...live.series.map((item) => Date.parse(item.timestamp)).filter((value) => Number.isFinite(value)),
    Date.parse(live.updatedAt ?? ""),
  );
  for (const item of live.forecast) {
    assert.equal(item.kind, "verwacht");
    assert.equal(Number.isFinite(item.levelCm), true);
    assert.ok(Date.parse(item.timestamp) > lastMeasured);
  }
});
