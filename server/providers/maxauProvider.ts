import { applyMeasuredStatus } from "../water/classifyWaterLevel.js";
import { readMaxauFromHvz, type HvzReading } from "./hvzDataset.js";
import { readPegelonlineChart } from "./pegelonline.js";
import {
  clipForecastAfterMeasurement,
  readMaxauForecast,
  resetMaxauForecastCacheForTests,
  setMaxauForecastClockForTests,
} from "./rlpMaxauForecast.js";
import { failedStation, type WaterLevelProvider, type WaterStationResult } from "./waterLevelProvider.js";

const MAXAU_PEGEL_UUID = "b6c6d5c8-e2d5-4469-8dd8-fa972ef7eaea";
export const MAXAU_MEASUREMENT_FRESH_MS = 5 * 60 * 1000;
export const MAXAU_MEASUREMENT_STALE_MS = 6 * 60 * 60 * 1000;

const meta = {
  id: "maxau" as const,
  name: "Maxau",
  river: "Rijn",
  source: "HVZ Baden-Württemberg",
};

type LevelReader = () => Promise<HvzReading>;
type ChartReader = typeof readPegelonlineChart;

let clock = () => Date.now();
let levelReader: LevelReader = readMaxauFromHvz;
let chartReader: ChartReader = readPegelonlineChart;
let measurementCache: { fetchedAt: number; reading: HvzReading } | null = null;

export function resetMaxauProviderForTests() {
  clock = () => Date.now();
  levelReader = readMaxauFromHvz;
  chartReader = readPegelonlineChart;
  measurementCache = null;
  resetMaxauForecastCacheForTests();
}

export function setMaxauProviderForTests(options: {
  now?: () => number;
  readLevel?: LevelReader;
  readChart?: ChartReader;
}) {
  if (options.now) {
    clock = options.now;
    setMaxauForecastClockForTests(options.now);
  }
  if (options.readLevel) levelReader = options.readLevel;
  if (options.readChart) chartReader = options.readChart;
}

async function readMeasurement(): Promise<HvzReading> {
  const now = clock();
  if (measurementCache && now - measurementCache.fetchedAt < MAXAU_MEASUREMENT_FRESH_MS) {
    return measurementCache.reading;
  }
  try {
    const reading = await levelReader();
    measurementCache = { fetchedAt: now, reading };
    return reading;
  } catch (error) {
    if (measurementCache && now - measurementCache.fetchedAt < MAXAU_MEASUREMENT_STALE_MS) {
      return measurementCache.reading;
    }
    throw error;
  }
}

export class MaxauProvider implements WaterLevelProvider {
  async getCurrentData(): Promise<WaterStationResult> {
    try {
      const reading = await readMeasurement();
      const chart = await chartReader(MAXAU_PEGEL_UUID).catch(() => null);
      const forecast = await readMaxauForecast();
      const series = chart?.series ?? [];
      const visible = clipForecastAfterMeasurement(forecast.points, series, reading.updatedAt);
      const forecastStatus = visible.length >= 2 ? forecast.status : "unavailable";
      return {
        ...meta,
        ...applyMeasuredStatus("maxau", reading),
        series,
        forecast: visible,
        forecastError: forecastStatus === "stale" ? forecast.message : null,
        forecastIssuedAt: forecastStatus === "unavailable" ? null : forecast.issuedAt,
        forecastValidFrom: visible[0]?.timestamp ?? null,
        forecastValidTo: visible.length >= 2 ? (visible[visible.length - 1]?.timestamp ?? null) : null,
        forecastSource: forecastStatus === "unavailable" ? null : forecast.source,
        forecastStationId: forecastStatus === "unavailable" ? null : forecast.stationId,
        forecastStatus,
        forecastClock: "absolute",
        graphPath: null,
        error: null,
      };
    } catch (error) {
      return failedStation(meta, error);
    }
  }
}
