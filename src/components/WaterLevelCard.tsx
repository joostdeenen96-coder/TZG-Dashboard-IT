import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { formatAmsterdamTime, formatWaterChange } from "../lib/format";
import { capForecastHorizon, displayMillis, forecastClockFor, outlookCaption, selectDailyForecast } from "../lib/waterForecast";
import type { WaterLevelSeverity, WaterStationResult, WaterStatus, WaterTrend } from "../types";
import { CardState } from "./CardState";
import { WaterChart } from "./WaterChart";

type WaterLevelCardProps = {
  station: WaterStationResult;
  refreshing?: boolean;
  stale?: boolean;
};

const dayLabel = new Intl.DateTimeFormat("nl-NL", {
  timeZone: "Europe/Amsterdam",
  weekday: "short",
  day: "numeric",
  month: "short",
});

function isReady(station: WaterStationResult): station is WaterStationResult & {
  levelCm: number;
  changeCm: number;
  trend: WaterTrend;
  status: WaterStatus;
  severity: WaterLevelSeverity;
  updatedAt: string;
} {
  return (
    station.error === null &&
    station.levelCm !== null &&
    station.changeCm !== null &&
    station.trend !== null &&
    station.status !== null &&
    station.severity !== null &&
    station.updatedAt !== null
  );
}

export function WaterLevelCard({ station, refreshing = false, stale = false }: WaterLevelCardProps) {
  if (!isReady(station)) {
    return <CardState status="error" title={station.name} message={station.error ?? "Peil niet beschikbaar."} />;
  }

  const TrendIcon = station.trend === "stijgend" ? ArrowUp : station.trend === "dalend" ? ArrowDown : Minus;
  const clock = forecastClockFor(station);
  const now = new Date();
  const horizon = capForecastHorizon(station.forecast, now, clock);
  const days = selectDailyForecast(station.forecast, now, clock);
  const sourceLabel = station.forecastSource && station.forecast.length > 0 ? station.forecastSource : station.source;
  const outlookStale = station.forecastStatus === "stale";

  return (
    <article className="tv-card relative flex h-full min-h-0 flex-col px-6 py-5" data-water-card="" data-status={stale ? "fallback" : "ready"} data-forecast-clock={clock}>
      {refreshing ? <span className="absolute inset-x-0 top-0 h-0.5 animate-pulse bg-gold" aria-label="Vernieuwen" /> : null}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate font-display text-[32px] leading-none font-semibold tracking-[-0.015em]" data-water-name="">
            {station.name}
          </h2>
          <p className="mt-1 text-[13px] font-bold tracking-[0.08em] text-mist uppercase" data-water-river="">
            {station.river} · waterstand
          </p>
        </div>
        <span
          className="water-status-badge shrink-0 rounded-full border px-2.5 py-1 text-center text-[13px] font-bold tracking-[0.04em] uppercase"
          data-water-status=""
          data-water-severity={station.severity}
        >
          {station.status}
        </span>
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <p className="flex items-end gap-2 font-display leading-none">
          <span className="text-[64px] font-semibold tabular-nums" data-water-level="">{station.levelCm}</span>
          <span className="mb-1 text-[20px] font-medium text-mist" data-water-unit="">cm</span>
        </p>
        <p className="mb-1 flex items-center gap-2 text-[16px] font-medium" data-water-meta="">
          <TrendIcon className="h-4 w-4 text-gold" strokeWidth={2.4} />
          <span className="text-gold">{station.trend}</span>
          <span className="text-mist">{formatWaterChange(station.changeCm)}</span>
        </p>
      </div>
      <div className="mt-2 min-h-0 flex-1">
        <WaterChart
          series={station.series}
          forecast={station.forecast}
          stationName={station.name}
          forecastClock={clock}
          source={sourceLabel}
          issuedAt={station.forecastIssuedAt}
          now={now}
        />
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-mist" data-water-legend="">
        <span className="inline-flex items-center gap-1"><span className="inline-block h-0.5 w-4 bg-water" /> Gemeten</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-0.5 w-4 border-t-2 border-dashed border-gold" /> Voorspelling</span>
        {station.forecast.some((point) => point.kind === "inschatting") ? (
          <span className="inline-flex items-center gap-1"><span className="inline-block h-0.5 w-4 border-t-2 border-dotted border-mist" /> Inschatting</span>
        ) : null}
      </div>
      <p
        className={`mt-1 text-[13px] ${outlookStale ? "text-gold" : "text-mist"}`}
        data-water-horizon=""
        data-water-outlook={horizon.reachesSixWeeks ? "six-weeks" : "unavailable"}
        data-water-outlook-days={horizon.dayCount}
        data-water-outlook-end={horizon.endKey ?? ""}
      >
        {outlookCaption(horizon, outlookStale)}
      </p>
      {days.length > 0 && horizon.dayCount <= 5 ? (
        <ul className="mt-2 grid gap-1" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
          {days.map((point) => (
            <li key={point.timestamp} className="min-w-0 text-center">
              <p className="truncate text-[12px] text-mist" data-water-forecast-day="">
                {dayLabel.format(new Date(displayMillis(point.timestamp, clock)))}
              </p>
              <p className="font-display text-[18px] leading-none font-semibold tabular-nums" data-water-forecast-value="">{point.levelCm}</p>
              <p className="truncate text-[11px] tracking-[0.02em] text-gold uppercase" data-water-forecast-kind="">{point.kind}</p>
            </li>
          ))}
        </ul>
      ) : null}
      {station.forecastError ? (
        <p
          className={`mt-1 truncate text-[13px] ${station.forecastStatus === "stale" ? "text-gold" : "text-mist"}`}
          data-water-forecast-status={station.forecastStatus ?? ""}
        >
          {station.forecastError}
        </p>
      ) : null}
      <p className={`mt-1 truncate text-[13px] ${stale ? "text-gold" : "text-mist"}`} data-water-source="">
        {stale ? "Laatste bekende gegevens · " : ""}
        Bijgewerkt {formatAmsterdamTime(station.updatedAt)} · {sourceLabel}
      </p>
    </article>
  );
}
