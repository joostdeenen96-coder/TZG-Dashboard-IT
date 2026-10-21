import { logError, logInfo, logWarn } from "../log.js";
import { fetchOpenMeteoForecast } from "../providers/openMeteoWeatherProvider.js";
import { parseWeatherForecast, type WeatherForecast } from "../providers/weatherModel.js";
import { getScreenConfig } from "./dashboardConfig.js";

type WeatherFetcher = (location: string) => Promise<WeatherForecast>;
let weatherFetcher: WeatherFetcher = fetchOpenMeteoForecast;

const CACHE_TTL_MS = Math.max(
  60_000,
  Number.parseInt(process.env.WEATHER_CACHE_SECONDS || "300", 10) * 1000 || 300_000,
);
const STALE_MAX_MS = 6 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 2;

type CacheEntry = {
  key: string;
  data: WeatherForecast;
  fetchedAt: number;
};

let cache: CacheEntry | null = null;
let inFlight: Promise<WeatherForecast> | null = null;
let inFlightKey = "";

function cacheKey(location: string) {
  return location.trim().toLowerCase() || "gennep";
}

function resolveLocation(requested?: string) {
  const fromQuery = requested?.trim();
  if (fromQuery) return fromQuery;
  const configured = getScreenConfig().weer.plaatsnaam?.trim();
  return configured || "Gennep";
}

async function loadFresh(location: string): Promise<WeatherForecast> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const forecast = await weatherFetcher(location);
      const parsed = parseWeatherForecast(forecast);
      if (!parsed) throw new Error("Weerrespons ongeldig na validatie.");
      return parsed;
    } catch (error) {
      lastError = error;
      if (attempt < MAX_ATTEMPTS) {
        logWarn("weer opnieuw proberen", { event: "weather.retry" });
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Weer niet beschikbaar.");
}

export async function getWeatherForecast(requestedLocation?: string): Promise<WeatherForecast> {
  const location = resolveLocation(requestedLocation);
  const key = cacheKey(location);
  const now = Date.now();

  if (cache && cache.key === key && now - cache.fetchedAt < CACHE_TTL_MS) {
    return { ...cache.data, status: cache.data.status === "unavailable" ? "unavailable" : cache.data.status };
  }

  if (inFlight && inFlightKey === key) return inFlight;

  inFlightKey = key;
  inFlight = (async () => {
    try {
      const data = await loadFresh(location);
      cache = { key, data, fetchedAt: Date.now() };
      logInfo(`weer geladen ${data.location} dagen=${data.days.length}`, { event: "weather.fetch" });
      return data;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Weer niet beschikbaar.";
      logError(`weer ophalen mislukt (${message})`, { event: "weather.error" });
      if (cache && cache.key === key && Date.now() - cache.fetchedAt < STALE_MAX_MS) {
        const stale: WeatherForecast = { ...cache.data, status: "stale" };
        logWarn("weer fallback op cache", { event: "weather.stale" });
        return stale;
      }
      throw new Error("Weer niet beschikbaar.");
    } finally {
      inFlight = null;
      inFlightKey = "";
    }
  })();

  return inFlight;
}

/** Alleen voor tests. */
export function resetWeatherCache() {
  cache = null;
  inFlight = null;
  inFlightKey = "";
  weatherFetcher = fetchOpenMeteoForecast;
}

/** Alleen voor tests. */
export function setWeatherFetcherForTests(fetcher: WeatherFetcher | null) {
  weatherFetcher = fetcher ?? fetchOpenMeteoForecast;
}

/** Alleen voor tests: markeer cache als verlopen zodat de volgende call opnieuw ophaalt. */
export function expireWeatherCacheForTests() {
  if (cache) cache = { ...cache, fetchedAt: Date.now() - CACHE_TTL_MS - 1 };
}
