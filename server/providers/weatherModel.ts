export type WeatherIconName = "cloud" | "rain" | "showers" | "sun" | "sun-cloud";

export type WeatherForecastDay = {
  date: string;
  dayLabel: string;
  condition: string;
  icon: WeatherIconName;
  temperatureMin?: number;
  temperatureMax?: number;
  precipitationProbability?: number;
  precipitationAmount?: number;
  windSpeed?: number;
  windDirection?: string;
  sunrise?: string;
  sunset?: string;
};

export type WeatherCurrent = {
  temperatureC: number;
  feelsLikeC?: number;
  condition: string;
  summary?: string;
  icon: WeatherIconName;
  wind?: string;
  windSpeed?: number;
  windDirection?: string;
  humidityPct?: number;
};

export type WeatherForecastStatus = "ok" | "stale" | "partial" | "unavailable";

export type WeatherForecast = {
  location: string;
  current: WeatherCurrent;
  days: WeatherForecastDay[];
  generatedAt: string;
  source: string;
  status: WeatherForecastStatus;
  /** Compat voor bestaande compacte UI. */
  temperatureC: number;
  feelsLikeC?: number;
  condition: string;
  summary?: string;
  icon: WeatherIconName;
  wind?: string;
  humidityPct?: number;
  forecast: Array<{
    day: string;
    icon: WeatherIconName;
    highC?: number;
    lowC?: number;
    condition: string;
  }>;
};

export function isWeatherIconName(value: unknown): value is WeatherIconName {
  return value === "cloud" || value === "rain" || value === "showers" || value === "sun" || value === "sun-cloud";
}

function optionalNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return value;
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  return value.trim();
}

export function parseWeatherForecast(value: unknown): WeatherForecast | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const currentRaw = row.current;
  if (!currentRaw || typeof currentRaw !== "object" || Array.isArray(currentRaw)) return null;
  const current = currentRaw as Record<string, unknown>;
  if (typeof current.temperatureC !== "number" || !Number.isFinite(current.temperatureC)) return null;
  if (typeof current.condition !== "string" || !current.condition.trim()) return null;
  if (!isWeatherIconName(current.icon)) return null;
  if (typeof row.location !== "string" || !row.location.trim()) return null;
  if (typeof row.generatedAt !== "string" || !row.generatedAt.trim()) return null;
  if (typeof row.source !== "string" || !row.source.trim()) return null;
  const status = row.status;
  if (status !== "ok" && status !== "stale" && status !== "partial" && status !== "unavailable") return null;
  if (!Array.isArray(row.days)) return null;

  const days: WeatherForecastDay[] = [];
  for (const item of row.days) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const day = item as Record<string, unknown>;
    if (typeof day.date !== "string" || !day.date.trim()) continue;
    if (typeof day.dayLabel !== "string" || !day.dayLabel.trim()) continue;
    if (typeof day.condition !== "string" || !day.condition.trim()) continue;
    if (!isWeatherIconName(day.icon)) continue;
    days.push({
      date: day.date.trim(),
      dayLabel: day.dayLabel.trim(),
      condition: day.condition.trim(),
      icon: day.icon,
      temperatureMin: optionalNumber(day.temperatureMin),
      temperatureMax: optionalNumber(day.temperatureMax),
      precipitationProbability: optionalNumber(day.precipitationProbability),
      precipitationAmount: optionalNumber(day.precipitationAmount),
      windSpeed: optionalNumber(day.windSpeed),
      windDirection: optionalString(day.windDirection),
      sunrise: optionalString(day.sunrise),
      sunset: optionalString(day.sunset),
    });
  }

  const weatherCurrent: WeatherCurrent = {
    temperatureC: current.temperatureC,
    feelsLikeC: optionalNumber(current.feelsLikeC),
    condition: current.condition.trim(),
    summary: optionalString(current.summary),
    icon: current.icon,
    wind: optionalString(current.wind),
    windSpeed: optionalNumber(current.windSpeed),
    windDirection: optionalString(current.windDirection),
    humidityPct: optionalNumber(current.humidityPct),
  };

  return {
    location: row.location.trim(),
    current: weatherCurrent,
    days,
    generatedAt: row.generatedAt.trim(),
    source: row.source.trim(),
    status,
    temperatureC: weatherCurrent.temperatureC,
    feelsLikeC: weatherCurrent.feelsLikeC,
    condition: weatherCurrent.condition,
    summary: weatherCurrent.summary,
    icon: weatherCurrent.icon,
    wind: weatherCurrent.wind,
    humidityPct: weatherCurrent.humidityPct,
    forecast: days.map((day) => ({
      day: day.dayLabel,
      icon: day.icon,
      highC: day.temperatureMax,
      lowC: day.temperatureMin,
      condition: day.condition,
    })),
  };
}
