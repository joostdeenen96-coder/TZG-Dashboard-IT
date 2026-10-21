import { useSyncExternalStore } from "react";
import type { QueryState } from "../types";
import { acceptWeatherForecast, type WeatherForecast } from "../types/weather";
import { useScreenConfig } from "./dashboardConfigService";
import { createPollingFeed } from "./tvFeed";
import { cacheContainsSecrets } from "../../shared/weatherCacheGuard";

const WEATHER_PATH = "/api/weather";

async function loadWeather(signal: AbortSignal, location: string): Promise<WeatherForecast | "empty"> {
  const url = `${WEATHER_PATH}?location=${encodeURIComponent(location)}`;
  const response = await fetch(url, { signal });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload && typeof (payload as { error: unknown }).error === "string"
        ? (payload as { error: string }).error
        : `Weer antwoordde met ${response.status}.`;
    throw new Error(message);
  }
  const mapped = acceptWeatherForecast(payload);
  if (!mapped) throw new Error("Weer heeft een ongeldig formaat.");
  return mapped;
}

function acceptCached(value: unknown): WeatherForecast | null {
  return acceptWeatherForecast(value);
}

const feeds = new Map<string, ReturnType<typeof createPollingFeed<WeatherForecast>>>();

function feedFor(location: string) {
  const key = location.trim().toLowerCase() || "gennep";
  const existing = feeds.get(key);
  if (existing) return existing;
  const feed = createPollingFeed<WeatherForecast>({
    name: "weer",
    storageKey: `teunesen.tv.weather.v2.${key}`,
    unavailable: "Weer niet bereikbaar.",
    load: (signal) => loadWeather(signal, location.trim() || "Gennep"),
    accept: (value) => {
      const mapped = acceptCached(value);
      if (!mapped) return null;
      try {
        const raw = JSON.stringify(mapped);
        if (cacheContainsSecrets(raw)) return null;
      } catch {
        return null;
      }
      return mapped;
    },
  });
  feeds.set(key, feed);
  return feed;
}

export function useWeatherForecast(): QueryState<WeatherForecast> {
  const plaatsnaam = useScreenConfig().weer.plaatsnaam || "Gennep";
  const feed = feedFor(plaatsnaam);
  return useSyncExternalStore(feed.subscribe, feed.getSnapshot, feed.getSnapshot);
}
