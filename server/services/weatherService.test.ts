import assert from "node:assert/strict";
import test from "node:test";
import {
  expireWeatherCacheForTests,
  getWeatherForecast,
  resetWeatherCache,
  setWeatherFetcherForTests,
} from "./weatherService.js";

test("getWeatherForecast haalt live Open-Meteo data op en cached", async () => {
  resetWeatherCache();
  const first = await getWeatherForecast("Gennep");
  assert.equal(typeof first.temperatureC, "number");
  assert.ok(first.days.length >= 1);
  assert.ok(first.days.length <= 7);
  assert.equal(first.source, "Open-Meteo");
  assert.ok(first.status === "ok" || first.status === "partial");
  assert.ok(!JSON.stringify(first).toLowerCase().includes("api_key"));
  assert.ok(!JSON.stringify(first).includes("apikey"));

  const second = await getWeatherForecast("Gennep");
  assert.equal(second.generatedAt, first.generatedAt);
  assert.equal(second.days.length, first.days.length);
});

test("getWeatherForecast faalt gecontroleerd bij onbekende locatie zonder crash", async () => {
  resetWeatherCache();
  await assert.rejects(() => getWeatherForecast("xyzzy-nietbestaande-plaats-99999"), /Weer niet beschikbaar/);
});

test("getWeatherForecast gebruikt stale cache bij bronfout", async () => {
  resetWeatherCache();
  const first = await getWeatherForecast("Gennep");
  assert.ok(first.days.length >= 1);

  setWeatherFetcherForTests(async () => {
    throw new Error("gesimuleerde bronfout");
  });
  expireWeatherCacheForTests();
  const stale = await getWeatherForecast("Gennep");
  assert.equal(stale.status, "stale");
  assert.equal(stale.generatedAt, first.generatedAt);
  assert.ok(stale.days.length >= 1);
  resetWeatherCache();
});
