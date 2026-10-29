import { fetchJson } from "./http.js";
import {
  trendFromChange,
  type WaterForecastPoint,
  type WaterPoint,
  type WaterTrend,
} from "./waterLevelProvider.js";

const PEGELONLINE_BASE = "https://www.pegelonline.wsv.de/webservices/rest-api/v2";
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_GAP_MS = 90 * 60 * 1000;

type Measurement = {
  timestamp: string;
  value: number;
};

export type PegelonlineReading = {
  levelCm: number;
  changeCm: number;
  trend: WaterTrend;
  updatedAt: string;
  series: WaterPoint[];
  forecast: WaterForecastPoint[];
  forecastError: string | null;
  graphPath: null;
};

function asObject(value: unknown, message: string) {
  if (!value || typeof value !== "object") throw new Error(message);
  return value as Record<string, unknown>;
}

function asMeasurements(value: unknown): Measurement[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("Geen meetreeks voor de vorige dag.");
  }
  return value.map((item) => {
    const row = asObject(item, "Meetreeks is ongeldig.");
    if (typeof row.timestamp !== "string" || typeof row.value !== "number" || !Number.isFinite(row.value)) {
      throw new Error("Meetreeks is ongeldig.");
    }
    return { timestamp: row.timestamp, value: row.value };
  });
}

function valueOneDayEarlier(measurements: Measurement[], currentIso: string) {
  const current = Date.parse(currentIso);
  if (!Number.isFinite(current)) throw new Error("Tijdstip van de waterstand is ongeldig.");
  const target = current - DAY_MS;
  let best: Measurement | null = null;
  let bestGap = Number.POSITIVE_INFINITY;
  for (const measurement of measurements) {
    const gap = Math.abs(Date.parse(measurement.timestamp) - target);
    if (gap < bestGap) {
      best = measurement;
      bestGap = gap;
    }
  }
  if (!best || bestGap > MAX_GAP_MS) {
    throw new Error("Geen waterstand van ongeveer een dag eerder.");
  }
  return best.value;
}

function thin(measurements: Measurement[], maxPoints: number) {
  if (measurements.length <= maxPoints) return measurements;
  const picked: Measurement[] = [];
  const step = (measurements.length - 1) / (maxPoints - 1);
  for (let index = 0; index < maxPoints; index += 1) {
    picked.push(measurements[Math.round(index * step)]);
  }
  return picked;
}

function toPoint(measurement: Measurement): WaterPoint {
  return { timestamp: measurement.timestamp, levelCm: Math.round(measurement.value) };
}

function forecastKind(value: unknown): WaterForecastPoint["kind"] | null {
  if (value === "forecast" || value === "forcast") return "verwacht";
  if (value === "estimate") return "inschatting";
  return null;
}

function asForecast(value: unknown): WaterForecastPoint[] {
  if (!Array.isArray(value)) throw new Error("Verwachting is ongeldig.");
  const points: WaterForecastPoint[] = [];
  for (const item of value) {
    const row = asObject(item, "Verwachting is ongeldig.");
    const kind = forecastKind(row.type);
    if (!kind || typeof row.timestamp !== "string" || typeof row.value !== "number" || !Number.isFinite(row.value)) {
      continue;
    }
    points.push({ timestamp: row.timestamp, levelCm: Math.round(row.value), kind });
  }
  points.sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp));
  return points;
}

async function readForecast(uuid: string): Promise<{ forecast: WaterForecastPoint[]; forecastError: string | null }> {
  try {
    const raw = await fetchJson(`${PEGELONLINE_BASE}/stations/${uuid}/WV/measurements.json`);
    const forecast = asForecast(raw);
    if (forecast.length === 0) return { forecast: [], forecastError: "Geen verwachting in de bronreeks." };
    return { forecast, forecastError: null };
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : "Verwachting niet bereikbaar.";
    return { forecast: [], forecastError: message };
  }
}

export async function readPegelonlineChart(uuid: string) {
  const historyUrl = `${PEGELONLINE_BASE}/stations/${uuid}/W/measurements.json?start=P4D`;
  const [historyRaw, forecastResult] = await Promise.all([fetchJson(historyUrl), readForecast(uuid)]);
  const history = asMeasurements(historyRaw);
  return {
    history,
    series: thin(history, 48).map(toPoint),
    forecast: forecastResult.forecast,
    forecastError: forecastResult.forecast.length > 0 ? null : forecastResult.forecastError,
  };
}

export async function readPegelonlineWater(station: { uuid: string; shortname: string }): Promise<PegelonlineReading> {
  const seriesUrl = `${PEGELONLINE_BASE}/stations/${station.uuid}/W.json?includeCurrentMeasurement=true`;
  const [seriesRaw, chart] = await Promise.all([
    fetchJson(seriesUrl),
    readPegelonlineChart(station.uuid),
  ]);
  const series = asObject(seriesRaw, `Tijdreeks ${station.shortname} is ongeldig.`);
  if (series.shortname !== "W" || series.unit !== "cm") {
    throw new Error("Waterstand staat niet in centimeter.");
  }
  const current = asObject(series.currentMeasurement, "Actuele waterstand ontbreekt.");
  if (typeof current.timestamp !== "string" || typeof current.value !== "number" || !Number.isFinite(current.value)) {
    throw new Error("Actuele waterstand is ongeldig.");
  }
  const previous = valueOneDayEarlier(chart.history, current.timestamp);
  const levelCm = Math.round(current.value);
  const changeCm = levelCm - Math.round(previous);
  return {
    levelCm,
    changeCm,
    trend: trendFromChange(changeCm),
    updatedAt: current.timestamp,
    series: chart.series,
    forecast: chart.forecast,
    forecastError: chart.forecastError,
    graphPath: null,
  };
}
