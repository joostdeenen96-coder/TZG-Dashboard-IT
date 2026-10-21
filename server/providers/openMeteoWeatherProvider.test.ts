import assert from "node:assert/strict";
import test from "node:test";
import {
  conditionFromWeatherCode,
  degreesToCompass,
  formatWind,
  iconFromWeatherCode,
  kmhToBeaufort,
  OPEN_METEO_FORECAST_DAYS,
} from "./openMeteoWeatherProvider.js";
import { parseWeatherForecast } from "./weatherModel.js";

test("open-meteo forecast days is maximaal 7 inclusief vandaag", () => {
  assert.equal(OPEN_METEO_FORECAST_DAYS, 7);
});

test("weather codes mappen naar iconen en NL-omschrijvingen", () => {
  assert.equal(iconFromWeatherCode(0), "sun");
  assert.equal(iconFromWeatherCode(2), "sun-cloud");
  assert.equal(iconFromWeatherCode(3), "cloud");
  assert.equal(iconFromWeatherCode(61), "rain");
  assert.equal(iconFromWeatherCode(80), "showers");
  assert.equal(conditionFromWeatherCode(0), "Zonnig");
  assert.equal(conditionFromWeatherCode(3), "Bewolkt");
});

test("windformattering gebruikt Bft zoals de bestaande UI", () => {
  assert.equal(kmhToBeaufort(15), 3);
  assert.equal(degreesToCompass(225), "ZW");
  assert.equal(formatWind(25, 225), "ZW 4 Bft");
  assert.equal(formatWind(undefined, 10), undefined);
});

test("parseWeatherForecast weigert ongeldige data en accepteert gedeeltelijke dagen", () => {
  assert.equal(parseWeatherForecast(null), null);
  assert.equal(parseWeatherForecast({ location: "Gennep" }), null);
  const ok = parseWeatherForecast({
    location: "Gennep",
    current: { temperatureC: 12, condition: "Bewolkt", icon: "cloud" },
    days: [
      { date: "2026-10-21", dayLabel: "Vandaag", condition: "Bewolkt", icon: "cloud", temperatureMax: 14 },
      { date: "bad", dayLabel: "x", condition: "y", icon: "nope" },
    ],
    generatedAt: "2026-10-21T10:00:00.000Z",
    source: "Open-Meteo",
    status: "ok",
  });
  assert.ok(ok);
  assert.equal(ok.days.length, 1);
  assert.equal(ok.temperatureC, 12);
  assert.equal(ok.forecast[0]?.day, "Vandaag");
  assert.equal(ok.days[0]?.temperatureMin, undefined);
});
