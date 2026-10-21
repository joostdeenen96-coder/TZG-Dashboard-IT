import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { Cloud, CloudDrizzle, CloudRain, CloudSun, Sun, X } from "lucide-react";
import type { WeatherForecast, WeatherForecastDay } from "../types/weather";
import type { WeatherIconName } from "../types";
import type { WeatherWidgetSettings } from "../../shared/weatherSettings";
import { formatAmsterdamTime } from "../lib/format";

const icons = {
  cloud: Cloud,
  rain: CloudRain,
  showers: CloudDrizzle,
  sun: Sun,
  "sun-cloud": CloudSun,
} satisfies Record<WeatherIconName, typeof Cloud>;

type WeatherForecastDialogProps = {
  forecast: WeatherForecast | null;
  settings: WeatherWidgetSettings;
  onClose: () => void;
  onInteract: () => void;
};

function formatDayDate(isoDate: string) {
  const stamp = Date.parse(`${isoDate}T12:00:00`);
  if (!Number.isFinite(stamp)) return isoDate;
  return new Intl.DateTimeFormat("nl-NL", {
    timeZone: "Europe/Amsterdam",
    day: "numeric",
    month: "short",
  }).format(new Date(stamp));
}

function DayCard({
  day,
  settings,
  isToday,
}: {
  day: WeatherForecastDay;
  settings: WeatherWidgetSettings;
  isToday: boolean;
}) {
  const Icon = icons[day.icon];
  const hasTemp = typeof day.temperatureMin === "number" || typeof day.temperatureMax === "number";
  return (
    <article
      className={`flex min-w-0 flex-1 flex-col rounded-[22px] border px-3 py-3 ${
        isToday ? "border-gold/45 bg-gold/[0.08]" : "border-veil/12 bg-veil/[0.04]"
      }`}
    >
      <p className="truncate text-[15px] font-semibold capitalize text-paper">{day.dayLabel}</p>
      <p className="mt-0.5 text-[13px] text-mist">{formatDayDate(day.date)}</p>
      <Icon className="mx-auto mt-3 h-10 w-10 text-gold" strokeWidth={2} aria-hidden />
      <p className="mt-2 truncate text-center text-[15px] text-mist">{day.condition}</p>
      {hasTemp ? (
        <p className="mt-3 text-center font-display text-[28px] leading-none font-semibold tabular-nums">
          {typeof day.temperatureMax === "number" ? `${day.temperatureMax}°` : "—"}
          <span className="mx-1 text-[18px] font-normal text-mist">/</span>
          <span className="text-[22px] text-mist">
            {typeof day.temperatureMin === "number" ? `${day.temperatureMin}°` : "—"}
          </span>
        </p>
      ) : (
        <p className="mt-3 text-center text-[15px] text-mist">Geen temperatuur</p>
      )}
      {settings.showPrecipitation && typeof day.precipitationProbability === "number" ? (
        <p className="mt-3 text-center text-[14px] text-mist">Neerslag {day.precipitationProbability}%</p>
      ) : null}
      {settings.showPrecipitation && typeof day.precipitationAmount === "number" ? (
        <p className="text-center text-[13px] text-mist/90">{day.precipitationAmount} mm</p>
      ) : null}
      {settings.showWind && (day.windDirection || typeof day.windSpeed === "number") ? (
        <p className="mt-2 truncate text-center text-[13px] text-mist">
          {[day.windDirection, typeof day.windSpeed === "number" ? `${day.windSpeed} km/u` : null]
            .filter(Boolean)
            .join(" · ")}
        </p>
      ) : null}
      {settings.showSunriseSunset && (day.sunrise || day.sunset) ? (
        <p className="mt-2 text-center text-[12px] text-mist/80">
          {day.sunrise ? formatAmsterdamTime(day.sunrise) : "—"}
          {" – "}
          {day.sunset ? formatAmsterdamTime(day.sunset) : "—"}
        </p>
      ) : null}
    </article>
  );
}

/** Alias voor de specificatie / tests. */
export const WeatherForecastModal = WeatherForecastDialog;

export function WeatherForecastDialog({ forecast, settings, onClose, onInteract }: WeatherForecastDialogProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const openedAtRef = useRef(Date.now());
  const days = forecast ? forecast.days.slice(0, settings.forecastDays) : [];
  const todayIso = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  useEffect(() => {
    openedAtRef.current = Date.now();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const updated = forecast ? formatAmsterdamTime(forecast.generatedAt) : "";
  const stale = forecast?.status === "stale";
  const emptyDays = !forecast || days.length === 0;

  const requestClose = () => {
    // Voorkom dat dezelfde openingsklik/touch de overlay meteen weer sluit.
    if (Date.now() - openedAtRef.current < 350) return;
    onClose();
  };

  return createPortal(
    <div
      data-testid="weather-forecast-modal"
      className="fixed inset-0 z-[10000] grid place-items-center bg-ink/70 p-6 backdrop-blur-md motion-safe:animate-[fadeIn_180ms_ease-out]"
      style={{ pointerEvents: "auto" }}
      role="presentation"
      onClick={requestClose}
      onMouseMove={onInteract}
      onPointerDown={onInteract}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="tv-card relative w-[min(1600px,85vw)] max-h-[min(900px,88vh)] overflow-hidden px-7 py-6 motion-safe:animate-[scaleIn_200ms_ease-out]"
        style={{ pointerEvents: "auto" }}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <button
          ref={closeRef}
          type="button"
          className="absolute top-5 right-5 grid h-12 w-12 place-items-center rounded-full border border-veil/15 bg-veil/[0.06] text-mist transition-colors hover:bg-veil/12 hover:text-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
          aria-label="Sluiten"
          onClick={onClose}
        >
          <X className="h-5 w-5" strokeWidth={2.2} />
        </button>

        <div className="pr-14">
          <h2 id={titleId} className="font-display text-[40px] leading-none font-semibold tracking-[-0.02em]">
            Weersverwachting
          </h2>
          <p className="mt-2 text-[18px] text-mist">
            {forecast?.location || "Locatie onbekend"}
            {updated ? (
              <>
                <span className="mx-2 text-gold">·</span>
                Laatste update {updated}
              </>
            ) : null}
            {stale ? <span className="ml-2 text-[#f0b4aa]">(verouderd)</span> : null}
          </p>
        </div>

        {emptyDays ? (
          <div className="mt-8 rounded-[22px] border border-veil/12 bg-veil/[0.04] px-6 py-10 text-center">
            <p className="text-[22px] font-semibold">Weersverwachting tijdelijk niet beschikbaar.</p>
            <p className="mt-2 text-[17px] text-mist">Probeer het later opnieuw. Het dashboard blijft beschikbaar.</p>
          </div>
        ) : (
          <div className="mt-6 flex gap-3">
            {days.map((day) => (
              <DayCard key={day.date} day={day} settings={settings} isToday={day.date === todayIso} />
            ))}
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-[14px] text-mist">
          <p>Bron: {forecast?.source || "—"}</p>
          {forecast?.status === "partial" ? <p>Een deel van de verwachting ontbreekt.</p> : null}
          {stale ? <p>Laatst bekende verwachting wordt getoond.</p> : null}
        </div>
      </section>
    </div>,
    document.body,
  );
}
