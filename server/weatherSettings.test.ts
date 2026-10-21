import assert from "node:assert/strict";
import test from "node:test";
import { readWeatherWidgetSettings, weatherPopupShouldClose } from "../shared/weatherSettings.js";

test("weather settings defaults blijven werken zonder opgeslagen velden", () => {
  const settings = readWeatherWidgetSettings({});
  assert.equal(settings.popupEnabled, true);
  assert.equal(settings.forecastDays, 7);
  assert.equal(settings.popupAutoCloseSeconds, 60);
  assert.equal(settings.showPrecipitation, true);
  assert.equal(settings.showWind, true);
  assert.equal(settings.showSunriseSunset, false);
});

test("weather settings lezen geldige overrides", () => {
  const settings = readWeatherWidgetSettings({
    popupEnabled: false,
    forecastDays: 5,
    popupAutoCloseSeconds: 0,
    showPrecipitation: false,
    showWind: false,
    showSunriseSunset: true,
  });
  assert.equal(settings.popupEnabled, false);
  assert.equal(settings.forecastDays, 5);
  assert.equal(settings.popupAutoCloseSeconds, 0);
  assert.equal(settings.showSunriseSunset, true);
});

test("ongeldige weather settings vallen terug op defaults", () => {
  const settings = readWeatherWidgetSettings({
    forecastDays: 99,
    popupAutoCloseSeconds: -1,
    popupEnabled: "maybe",
  });
  assert.equal(settings.forecastDays, 7);
  assert.equal(settings.popupAutoCloseSeconds, 60);
  assert.equal(settings.popupEnabled, true);
});

test("weather popup auto-close respecteert timer en reset via lastInteract", () => {
  const start = 1_000_000;
  assert.equal(weatherPopupShouldClose(start, start + 59_000, 60), false);
  assert.equal(weatherPopupShouldClose(start, start + 60_000, 60), true);
  // Interactie reset: nieuwe lastInteract verschuift de deadline
  assert.equal(weatherPopupShouldClose(start + 50_000, start + 100_000, 60), false);
  assert.equal(weatherPopupShouldClose(start + 50_000, start + 110_000, 60), true);
});

test("weather popup auto-close uit bij 0 seconden", () => {
  assert.equal(weatherPopupShouldClose(0, 999_999, 0), false);
});
