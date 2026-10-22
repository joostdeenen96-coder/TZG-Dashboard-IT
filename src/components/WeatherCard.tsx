import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, Cloud, CloudDrizzle, CloudRain, CloudSun, Sun } from "lucide-react";
import { WidgetBoundary } from "./WidgetBoundary";
import { WeatherForecastDialog } from "./WeatherForecastDialog";
import { useScreenConfig } from "../services/dashboardConfigService";
import { useWeatherForecast } from "../services/weatherService";
import {
  readWeatherWidgetSettings,
  weatherPopupShouldClose,
  type WeatherWidgetSettings,
} from "../../shared/weatherSettings";
import type { WeatherIconName } from "../types";
import type { WeatherForecast } from "../types/weather";

const weatherIcons = {
  cloud: Cloud,
  rain: CloudRain,
  showers: CloudDrizzle,
  sun: Sun,
  "sun-cloud": CloudSun,
} satisfies Record<WeatherIconName, typeof Cloud>;

type WeatherCardProps = {
  variant?: "header" | "card";
  settings?: Record<string, unknown>;
};

/**
 * Enige gedeelde weerkaart: compacte actuele info + weekpopup.
 * Zichtbaar → standaard aanklikbaar tenzij popupEnabled === false.
 */
export function WeatherCard({ variant = "card", settings }: WeatherCardProps) {
  const plaatsnaam = useScreenConfig().weer.plaatsnaam;
  const state = useWeatherForecast();
  const weatherSettings = readWeatherWidgetSettings(settings);
  const interactive = weatherSettings.popupEnabled;
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const lastInteractRef = useRef(Date.now());
  const wasOpenRef = useRef(false);

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  const openPopup = useCallback(() => {
    if (!interactive) return;
    lastInteractRef.current = Date.now();
    setOpen(true);
  }, [interactive]);

  const noteInteract = useCallback(() => {
    lastInteractRef.current = Date.now();
  }, []);

  useEffect(() => {
    if (wasOpenRef.current && !open) {
      triggerRef.current?.focus();
    }
    wasOpenRef.current = open;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const testHook = (window as unknown as { __TZG_WEATHER_AUTO_CLOSE__?: unknown }).__TZG_WEATHER_AUTO_CLOSE__;
    const seconds = typeof testHook === "number" ? testHook : weatherSettings.popupAutoCloseSeconds;
    if (seconds <= 0) return;
    const id = window.setInterval(() => {
      if (weatherPopupShouldClose(lastInteractRef.current, Date.now(), seconds)) close();
    }, 250);
    return () => window.clearInterval(id);
  }, [open, weatherSettings.popupAutoCloseSeconds, close]);

  const forecast: WeatherForecast | null =
    state.status === "ready" || state.status === "fallback" ? state.data : null;

  const temperatureC = forecast?.temperatureC;
  const condition = forecast?.condition || (state.status === "loading" ? "Weer laden…" : "Weer niet beschikbaar");
  const iconName: WeatherIconName = forecast?.icon || "cloud";
  const Icon = weatherIcons[iconName];
  const label = `${condition} · ${plaatsnaam || forecast?.location || "—"}`;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-testid="weather-card"
        data-popup-enabled={interactive ? "true" : "false"}
        className={
          variant === "header"
            ? `flex items-center gap-3 border-r border-veil/12 pr-5 text-left ${
                interactive
                  ? "cursor-pointer rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
                  : "cursor-default"
              }`
            : `tv-card flex h-full min-h-[100px] w-full items-center gap-4 px-5 py-4 text-left ${
                interactive
                  ? "cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
                  : "cursor-default"
              }`
        }
        style={{ pointerEvents: "auto" }}
        aria-label={interactive ? `Weerbericht, weekverwachting openen. ${label}` : `Weerbericht. ${label}`}
        aria-haspopup={interactive ? "dialog" : undefined}
        aria-expanded={interactive ? open : undefined}
        aria-disabled={interactive ? undefined : true}
        onClick={(event) => {
          if (!interactive) return;
          event.preventDefault();
          event.stopPropagation();
          openPopup();
        }}
        onKeyDown={(event) => {
          if (!interactive) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openPopup();
          }
        }}
      >
        <Icon
          className={variant === "header" ? "h-8 w-8 shrink-0 text-gold" : "h-12 w-12 shrink-0 text-gold"}
          strokeWidth={2.1}
          aria-hidden
        />
        <div className="min-w-0 leading-none">
          <p
            className={
              variant === "header"
                ? "font-display text-[34px] font-semibold tabular-nums"
                : "font-display text-[48px] font-semibold tabular-nums leading-none"
            }
            data-weather-temp={variant === "header" ? "" : undefined}
          >
            {typeof temperatureC === "number" ? `${temperatureC}°` : "—°"}
          </p>
          <p
            className={variant === "header" ? "mt-1 max-w-[240px] truncate text-[15px] text-mist" : "mt-2 text-[18px] text-mist"}
            data-weather-label={variant === "header" ? "" : undefined}
          >
            {label}
          </p>
        </div>
        {interactive ? (
          <span className="ml-1 flex items-center gap-1 text-[13px] tracking-wide text-mist uppercase">
            <span className="hidden xl:inline">Weekverwachting</span>
            <span className="xl:hidden">Week</span>
            <ChevronDown className="h-5 w-5 text-gold" strokeWidth={2.2} aria-hidden />
          </span>
        ) : null}
      </button>

      {open ? (
        <WeatherForecastDialog
          forecast={forecast}
          settings={weatherSettings}
          onClose={close}
          onInteract={noteInteract}
        />
      ) : null}
    </>
  );
}

export function WeatherWidgetView({ settings }: { settings?: Record<string, unknown> }) {
  return (
    <WidgetBoundary title="Weer" className="h-full min-h-[100px]">
      <WeatherCard variant="card" settings={settings} />
    </WidgetBoundary>
  );
}

/** @deprecated Gebruik WeatherCard — behouden voor bestaande imports. */
export function InteractiveWeather({
  variant,
  settings,
}: {
  variant: "header" | "card";
  settings?: Record<string, unknown>;
}) {
  return <WeatherCard variant={variant} settings={settings} />;
}

export type { WeatherWidgetSettings };
