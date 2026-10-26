import { fetchJson } from "./http.js";
import type { WaterForecastPoint, WaterPoint } from "./waterLevelProvider.js";

/**
 * Officiële keten, afgeleid uit de pagina
 * https://www.hochwasser.rlp.de/flussgebiet/oberrhein/maxau
 * en het script dat die pagina zelf laadt:
 *
 * - GET /api/v1/config → slugs.oberrhein.measurementsites.maxau.ms_number = 23700200
 * - measurementsite["23700200"].legendText = "Vorhersage der HVZ Baden-Württemberg"
 * - legendURL = https://www.hvz.baden-wuerttemberg.de/pegel.html?id=09016
 * - GET /api/v1/measurement-site/23700200
 * - De Vorhersage-lijn en de tabel zijn W.predictions.p50.
 *   Q is afvoer. measurements zijn metingen. p10–p90 zijn banden, geen lijn.
 * - Tijdstippen zijn ISO-8601 in UTC (Z). De pagina toont ze één keer in Europe/Berlin.
 */
export const MAXAU_RLP_PAGE_URL = "https://www.hochwasser.rlp.de/flussgebiet/oberrhein/maxau";
export const MAXAU_RLP_CONFIG_URL = "https://www.hochwasser.rlp.de/api/v1/config";
export const MAXAU_RLP_URL = "https://www.hochwasser.rlp.de/api/v1/measurement-site/23700200";
export const MAXAU_RLP_STATION_ID = "23700200";
export const MAXAU_HVZ_STATION_ID = "09016";
export const MAXAU_FORECAST_SOURCE =
  "HVZ Baden-Württemberg via Hochwasservorhersagezentrale Rheinland-Pfalz";
export const MAXAU_FORECAST_FRESH_MS = 5 * 60 * 1000;
export const MAXAU_FORECAST_STALE_MS = 6 * 60 * 60 * 1000;

const STALE_MESSAGE = "Voorspelling tijdelijk niet vernieuwd.";

export type MaxauForecastStatus = "ok" | "stale" | "unavailable";

export type ParsedMaxauForecast = {
  points: WaterForecastPoint[];
  issuedAt: string | null;
  nextUpdateAt: string | null;
};

export type MaxauForecastReading = ParsedMaxauForecast & {
  source: string;
  station: "Maxau";
  stationId: string;
  status: MaxauForecastStatus;
  message: string | null;
};

type FetchJson = (url: string) => Promise<unknown>;

let fetchImpl: FetchJson = fetchJson;
let clock = () => Date.now();
let cache: { fetchedAt: number; data: ParsedMaxauForecast } | null = null;
let inFlight: Promise<MaxauForecastReading> | null = null;

export function resetMaxauForecastCacheForTests() {
  fetchImpl = fetchJson;
  clock = () => Date.now();
  cache = null;
  inFlight = null;
}

export function setMaxauForecastFetchForTests(fn: FetchJson | null) {
  fetchImpl = fn ?? fetchJson;
}

export function setMaxauForecastClockForTests(fn: (() => number) | null) {
  clock = fn ?? (() => Date.now());
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function instant(value: unknown): { iso: string; epoch: number } | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch)) return null;
  return { iso: value, epoch };
}

export function parseRlpMaxauForecast(raw: unknown): ParsedMaxauForecast {
  const root = asRecord(raw);
  const water = asRecord(root?.W);
  if (!water) throw new Error("Waterstandsreeks W ontbreekt.");
  const predictions = asRecord(water.predictions);
  if (!predictions) throw new Error("Voorspelling ontbreekt.");
  if (!Array.isArray(predictions.p50)) throw new Error("Voorspelling p50 ontbreekt.");

  const points: WaterForecastPoint[] = [];
  const seen = new Set<number>();
  for (const item of predictions.p50) {
    const row = asRecord(item);
    if (!row) continue;
    const stamp = instant(row.x);
    const level = row.y;
    if (!stamp || typeof level !== "number" || !Number.isFinite(level)) continue;
    if (seen.has(stamp.epoch)) continue;
    seen.add(stamp.epoch);
    points.push({ timestamp: stamp.iso, levelCm: Math.round(level), kind: "verwacht" });
  }
  points.sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp));
  if (points.length < 2) throw new Error("Onvoldoende voorspellingspunten.");

  return {
    points,
    issuedAt: instant(predictions.time)?.iso ?? null,
    nextUpdateAt: instant(predictions.nextUpdateTime)?.iso ?? null,
  };
}

/** Laat voorspelling strikt ná de laatste meting beginnen. Minder dan twee punten is geen reeks. */
export function clipForecastAfterMeasurement(
  points: WaterForecastPoint[],
  series: WaterPoint[],
  updatedAt: string | null,
): WaterForecastPoint[] {
  let last = Number.NEGATIVE_INFINITY;
  for (const point of series) {
    const time = Date.parse(point.timestamp);
    if (Number.isFinite(time) && time > last) last = time;
  }
  if (updatedAt) {
    const updated = Date.parse(updatedAt);
    if (Number.isFinite(updated) && updated > last) last = updated;
  }
  const kept: WaterForecastPoint[] = [];
  const seen = new Set<number>();
  for (const point of points) {
    const time = Date.parse(point.timestamp);
    if (!Number.isFinite(time) || time <= last || !Number.isFinite(point.levelCm)) continue;
    if (seen.has(time)) continue;
    seen.add(time);
    kept.push(point);
  }
  kept.sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp));
  return kept.length >= 2 ? kept : [];
}

function present(data: ParsedMaxauForecast, status: "ok" | "stale", message: string | null): MaxauForecastReading {
  return {
    points: data.points.map((point) => ({ ...point })),
    issuedAt: data.issuedAt,
    nextUpdateAt: data.nextUpdateAt,
    source: MAXAU_FORECAST_SOURCE,
    station: "Maxau",
    stationId: MAXAU_RLP_STATION_ID,
    status,
    message,
  };
}

function unavailable(): MaxauForecastReading {
  return {
    points: [],
    issuedAt: null,
    nextUpdateAt: null,
    source: MAXAU_FORECAST_SOURCE,
    station: "Maxau",
    stationId: MAXAU_RLP_STATION_ID,
    status: "unavailable",
    message: null,
  };
}

export async function readMaxauForecast(): Promise<MaxauForecastReading> {
  const nowMs = clock();
  if (cache && nowMs - cache.fetchedAt < MAXAU_FORECAST_FRESH_MS) {
    return present(cache.data, "ok", null);
  }
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const parsed = parseRlpMaxauForecast(await fetchImpl(MAXAU_RLP_URL));
      cache = { fetchedAt: clock(), data: parsed };
      return present(parsed, "ok", null);
    } catch {
      const failedAt = clock();
      if (cache && failedAt - cache.fetchedAt < MAXAU_FORECAST_STALE_MS) {
        return present(cache.data, "stale", STALE_MESSAGE);
      }
      cache = null;
      return unavailable();
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}
