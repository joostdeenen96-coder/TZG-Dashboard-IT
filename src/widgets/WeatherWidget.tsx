import { Cloud, CloudDrizzle, CloudRain, CloudSun, Sun } from "lucide-react";
import { readWeather } from "../services/dashboardService";
import { useScreenConfig } from "../services/dashboardConfigService";
import type { WeatherIconName } from "../types";
import { CardState } from "../components/CardState";

const weatherIcons = {
  cloud: Cloud,
  rain: CloudRain,
  showers: CloudDrizzle,
  sun: Sun,
  "sun-cloud": CloudSun,
} satisfies Record<WeatherIconName, typeof Cloud>;

export function WeatherWidget() {
  const plaatsnaam = useScreenConfig().weer.plaatsnaam;
  const state = readWeather();
  if (state.status !== "ready") {
    return (
      <CardState
        className="h-full min-h-[100px]"
        status={state.status === "error" ? "error" : "loading"}
        title="Weer"
        message={state.status === "error" ? "Weer niet beschikbaar." : "Weer laden."}
      />
    );
  }
  const weather = state.data;
  const Icon = weatherIcons[weather.icon];
  return (
    <div className="tv-card flex h-full min-h-[100px] items-center gap-4 px-5 py-4">
      <Icon className="h-12 w-12 shrink-0 text-gold" strokeWidth={2.1} />
      <div>
        <p className="font-display text-[48px] font-semibold tabular-nums leading-none">{weather.temperatureC}°</p>
        <p className="mt-2 text-[18px] text-mist">
          {weather.condition} · {plaatsnaam || weather.location}
        </p>
      </div>
    </div>
  );
}
