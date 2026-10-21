export type WeatherWidgetSettings = {
  popupEnabled: boolean;
  forecastDays: number;
  popupAutoCloseSeconds: number;
  showPrecipitation: boolean;
  showWind: boolean;
  showSunriseSunset: boolean;
};

const DEFAULTS: WeatherWidgetSettings = {
  popupEnabled: true,
  forecastDays: 7,
  popupAutoCloseSeconds: 60,
  showPrecipitation: true,
  showWind: true,
  showSunriseSunset: false,
};

function bool(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

function int(value: unknown, fallback: number, min: number, max: number) {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isInteger(n) || n < min || n > max) return fallback;
  return n;
}

/**
 * Popup is AAN tenzij expliciet uitgezet.
 * undefined / ontbrekend / true → aan
 * false / "false" → uit
 */
export function isWeatherPopupEnabled(settings: Record<string, unknown> | null | undefined): boolean {
  const row = settings && typeof settings === "object" ? settings : {};
  if (!("popupEnabled" in row)) return true;
  if (row.popupEnabled === false || row.popupEnabled === "false") return false;
  if (row.popupEnabled === true || row.popupEnabled === "true") return true;
  return true;
}

/** Veilige defaults voor bestaande widgets zonder nieuwe settings. */
export function readWeatherWidgetSettings(settings: Record<string, unknown> | null | undefined): WeatherWidgetSettings {
  const row = settings && typeof settings === "object" ? settings : {};
  return {
    popupEnabled: isWeatherPopupEnabled(row),
    forecastDays: int(row.forecastDays, DEFAULTS.forecastDays, 1, 7),
    popupAutoCloseSeconds: int(row.popupAutoCloseSeconds, DEFAULTS.popupAutoCloseSeconds, 0, 3600),
    showPrecipitation: bool(row.showPrecipitation, DEFAULTS.showPrecipitation),
    showWind: bool(row.showWind, DEFAULTS.showWind),
    showSunriseSunset: bool(row.showSunriseSunset, DEFAULTS.showSunriseSunset),
  };
}

export const WEATHER_POPUP_AUTO_CLOSE_DEFAULT = DEFAULTS.popupAutoCloseSeconds;

/** Pure helper voor auto-close / timer-reset (unit-testbaar). */
export function weatherPopupShouldClose(
  lastInteractMs: number,
  nowMs: number,
  autoCloseSeconds: number,
): boolean {
  if (!Number.isFinite(autoCloseSeconds) || autoCloseSeconds <= 0) return false;
  if (!Number.isFinite(lastInteractMs) || !Number.isFinite(nowMs)) return false;
  return nowMs - lastInteractMs >= autoCloseSeconds * 1000;
}
