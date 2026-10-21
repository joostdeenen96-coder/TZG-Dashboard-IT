import { fetchJson } from "./http.js";
import type { WeatherCurrent, WeatherForecast, WeatherForecastDay, WeatherIconName } from "./weatherModel.js";

/** Open-Meteo levert tot 16 dagen; wij gebruiken maximaal 7 dagen inclusief vandaag. */
export const OPEN_METEO_FORECAST_DAYS = 7;
const SOURCE = "Open-Meteo";

const GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

type GeoHit = { name: string; latitude: number; longitude: number; country_code?: string };

const geoCache = new Map<string, { hit: GeoHit; at: number }>();
const GEO_TTL_MS = 24 * 60 * 60 * 1000;

function asObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asNumberArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === "number" && Number.isFinite(item) ? item : null));
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === "string" ? item : null));
}

/** WMO weather interpretation codes → huisstijliconen. */
export function iconFromWeatherCode(code: number): WeatherIconName {
  if (code === 0) return "sun";
  if (code === 1 || code === 2) return "sun-cloud";
  if (code === 3 || code === 45 || code === 48) return "cloud";
  if (code >= 51 && code <= 57) return "showers";
  if (code >= 61 && code <= 67) return "rain";
  if (code >= 71 && code <= 77) return "rain";
  if (code >= 80 && code <= 82) return "showers";
  if (code >= 85 && code <= 86) return "rain";
  if (code >= 95) return "rain";
  return "cloud";
}

export function conditionFromWeatherCode(code: number): string {
  if (code === 0) return "Zonnig";
  if (code === 1) return "Overwegend helder";
  if (code === 2) return "Gedeeltelijk bewolkt";
  if (code === 3) return "Bewolkt";
  if (code === 45 || code === 48) return "Mist";
  if (code >= 51 && code <= 55) return "Motregen";
  if (code === 56 || code === 57) return "Ijzel";
  if (code >= 61 && code <= 65) return "Regen";
  if (code === 66 || code === 67) return "IJzelregen";
  if (code >= 71 && code <= 77) return "Sneeuw";
  if (code >= 80 && code <= 82) return "Buien";
  if (code >= 85 && code <= 86) return "Sneeuwbuien";
  if (code >= 95) return "Onweer";
  return "Wisselvallig";
}

export function kmhToBeaufort(kmh: number): number {
  if (kmh < 1) return 0;
  if (kmh < 6) return 1;
  if (kmh < 12) return 2;
  if (kmh < 20) return 3;
  if (kmh < 29) return 4;
  if (kmh < 39) return 5;
  if (kmh < 50) return 6;
  if (kmh < 62) return 7;
  if (kmh < 75) return 8;
  if (kmh < 89) return 9;
  if (kmh < 103) return 10;
  if (kmh < 118) return 11;
  return 12;
}

export function degreesToCompass(degrees: number): string {
  const labels = ["N", "NO", "O", "ZO", "Z", "ZW", "W", "NW"];
  const index = Math.round((((degrees % 360) + 360) % 360) / 45) % 8;
  return labels[index] ?? "N";
}

export function formatWind(kmh: number | undefined, degrees: number | undefined): string | undefined {
  if (typeof kmh !== "number" || !Number.isFinite(kmh)) return undefined;
  const bft = kmhToBeaufort(kmh);
  if (typeof degrees === "number" && Number.isFinite(degrees)) {
    return `${degreesToCompass(degrees)} ${bft} Bft`;
  }
  return `${bft} Bft`;
}

function amsterdamDayLabel(isoDate: string, todayIso: string): string {
  if (isoDate === todayIso) return "Vandaag";
  const stamp = Date.parse(`${isoDate}T12:00:00`);
  if (!Number.isFinite(stamp)) return isoDate;
  return new Intl.DateTimeFormat("nl-NL", {
    timeZone: "Europe/Amsterdam",
    weekday: "long",
  }).format(new Date(stamp));
}

function todayAmsterdamIso() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function geocodeLocation(name: string): Promise<GeoHit> {
  const key = name.trim().toLowerCase();
  const cached = geoCache.get(key);
  if (cached && Date.now() - cached.at < GEO_TTL_MS) return cached.hit;

  const url = `${GEOCODE_URL}?name=${encodeURIComponent(name.trim())}&count=5&language=nl&format=json`;
  const payload = asObject(await fetchJson(url));
  const results = Array.isArray(payload?.results) ? payload.results : [];
  let hit: GeoHit | null = null;
  for (const row of results) {
    const item = asObject(row);
    if (!item) continue;
    if (typeof item.name !== "string" || typeof item.latitude !== "number" || typeof item.longitude !== "number") continue;
    // Prefer NL when meerdere hits.
    if (!hit || item.country_code === "NL") {
      hit = {
        name: item.name,
        latitude: item.latitude,
        longitude: item.longitude,
        country_code: typeof item.country_code === "string" ? item.country_code : undefined,
      };
      if (item.country_code === "NL") break;
    }
  }
  if (!hit) throw new Error("Locatie niet gevonden.");
  geoCache.set(key, { hit, at: Date.now() });
  return hit;
}

export async function fetchOpenMeteoForecast(locationName: string): Promise<WeatherForecast> {
  const place = await geocodeLocation(locationName);
  const params = new URLSearchParams({
    latitude: String(place.latitude),
    longitude: String(place.longitude),
    timezone: "Europe/Amsterdam",
    forecast_days: String(OPEN_METEO_FORECAST_DAYS),
    current: [
      "temperature_2m",
      "apparent_temperature",
      "relative_humidity_2m",
      "weather_code",
      "wind_speed_10m",
      "wind_direction_10m",
    ].join(","),
    daily: [
      "weather_code",
      "temperature_2m_max",
      "temperature_2m_min",
      "precipitation_sum",
      "precipitation_probability_max",
      "wind_speed_10m_max",
      "wind_direction_10m_dominant",
      "sunrise",
      "sunset",
    ].join(","),
  });
  const payload = asObject(await fetchJson(`${FORECAST_URL}?${params.toString()}`));
  if (!payload) throw new Error("Weerbron gaf geen geldige data.");

  const currentObj = asObject(payload.current);
  if (!currentObj) throw new Error("Actueel weer ontbreekt.");
  const weatherCode = typeof currentObj.weather_code === "number" ? currentObj.weather_code : 3;
  const temperatureC = typeof currentObj.temperature_2m === "number" ? currentObj.temperature_2m : null;
  if (temperatureC === null) throw new Error("Temperatuur ontbreekt.");

  const windSpeed = typeof currentObj.wind_speed_10m === "number" ? currentObj.wind_speed_10m : undefined;
  const windDirection = typeof currentObj.wind_direction_10m === "number" ? currentObj.wind_direction_10m : undefined;
  const condition = conditionFromWeatherCode(weatherCode);
  const icon = iconFromWeatherCode(weatherCode);
  const wind = formatWind(windSpeed, windDirection);
  const feelsLikeC =
    typeof currentObj.apparent_temperature === "number" ? Math.round(currentObj.apparent_temperature) : undefined;
  const humidityPct =
    typeof currentObj.relative_humidity_2m === "number" ? Math.round(currentObj.relative_humidity_2m) : undefined;

  const current: WeatherCurrent = {
    temperatureC: Math.round(temperatureC),
    feelsLikeC,
    condition,
    summary: condition,
    icon,
    wind,
    windSpeed: typeof windSpeed === "number" ? Math.round(windSpeed) : undefined,
    windDirection: typeof windDirection === "number" ? degreesToCompass(windDirection) : undefined,
    humidityPct,
  };

  const daily = asObject(payload.daily);
  const dates = asStringArray(daily?.time);
  const codes = asNumberArray(daily?.weather_code);
  const maxTemps = asNumberArray(daily?.temperature_2m_max);
  const minTemps = asNumberArray(daily?.temperature_2m_min);
  const precipSums = asNumberArray(daily?.precipitation_sum);
  const precipProbs = asNumberArray(daily?.precipitation_probability_max);
  const windMax = asNumberArray(daily?.wind_speed_10m_max);
  const windDir = asNumberArray(daily?.wind_direction_10m_dominant);
  const sunrises = asStringArray(daily?.sunrise);
  const sunsets = asStringArray(daily?.sunset);
  const today = todayAmsterdamIso();

  const days: WeatherForecastDay[] = [];
  for (let index = 0; index < dates.length && days.length < OPEN_METEO_FORECAST_DAYS; index += 1) {
    const date = dates[index];
    if (!date) continue;
    const code = codes[index];
    const dayCode = typeof code === "number" ? code : 3;
    const day: WeatherForecastDay = {
      date,
      dayLabel: amsterdamDayLabel(date, today),
      condition: conditionFromWeatherCode(dayCode),
      icon: iconFromWeatherCode(dayCode),
    };
    const tMax = maxTemps[index];
    const tMin = minTemps[index];
    if (typeof tMax === "number") day.temperatureMax = Math.round(tMax);
    if (typeof tMin === "number") day.temperatureMin = Math.round(tMin);
    const precipProb = precipProbs[index];
    if (typeof precipProb === "number") day.precipitationProbability = Math.round(precipProb);
    const precipSum = precipSums[index];
    if (typeof precipSum === "number") day.precipitationAmount = Math.round(precipSum * 10) / 10;
    const dayWind = windMax[index];
    if (typeof dayWind === "number") day.windSpeed = Math.round(dayWind);
    const dayDir = windDir[index];
    if (typeof dayDir === "number") day.windDirection = degreesToCompass(dayDir);
    const sunrise = sunrises[index];
    if (sunrise) day.sunrise = sunrise;
    const sunset = sunsets[index];
    if (sunset) day.sunset = sunset;
    days.push(day);
  }

  const generatedAt = new Date().toISOString();
  return {
    location: place.name,
    current,
    days,
    generatedAt,
    source: SOURCE,
    status: days.length > 0 ? "ok" : "partial",
    temperatureC: current.temperatureC,
    feelsLikeC: current.feelsLikeC,
    condition: current.condition,
    summary: current.summary,
    icon: current.icon,
    wind: current.wind,
    humidityPct: current.humidityPct,
    forecast: days.map((day) => ({
      day: day.dayLabel,
      icon: day.icon,
      highC: day.temperatureMax,
      lowC: day.temperatureMin,
      condition: day.condition,
    })),
  };
}
