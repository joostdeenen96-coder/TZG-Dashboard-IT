import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { formatAmsterdamTime, formatWaterChange } from "../lib/format";
import type { WaterForecastPoint, WaterStationResult, WaterStatus, WaterTrend } from "../types";
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
  updatedAt: string;
} {
  return (
    station.error === null &&
    station.levelCm !== null &&
    station.changeCm !== null &&
    station.trend !== null &&
    station.status !== null &&
    station.updatedAt !== null
  );
}

const MORNING_MINUTES = 6 * 60;

function amsterdamClock(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const hour = Number(read("hour"));
  return {
    key: `${read("year")}-${read("month")}-${read("day")}`,
    minutes: (hour === 24 ? 0 : hour) * 60 + Number(read("minute")),
  };
}

function dailyForecast(points: WaterForecastPoint[], now: Date) {
  const today = amsterdamClock(now).key;
  const byDay = new Map<string, WaterForecastPoint>();
  for (const point of points) {
    const stamp = new Date(point.timestamp);
    if (!Number.isFinite(stamp.getTime())) continue;
    const clock = amsterdamClock(new Date(stamp.getTime() + 24 * 60 * 60 * 1000));
    if (clock.key <= today) continue;
    const current = byDay.get(clock.key);
    if (!current) {
      byDay.set(clock.key, point);
      continue;
    }
    const currentDistance = Math.abs(amsterdamClock(new Date(current.timestamp)).minutes - MORNING_MINUTES);
    const nextDistance = Math.abs(clock.minutes - MORNING_MINUTES);
    if (nextDistance < currentDistance) byDay.set(clock.key, point);
  }
  return [...byDay.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(0, 5)
    .map(([, point]) => point);
}

export function WaterLevelCard({ station, refreshing = false, stale = false }: WaterLevelCardProps) {
  if (!isReady(station)) {
    return <CardState status="error" title={station.name} message={station.error ?? "Peil niet beschikbaar."} />;
  }

  const TrendIcon = station.trend === "stijgend" ? ArrowUp : station.trend === "dalend" ? ArrowDown : Minus;
  const days = dailyForecast(station.forecast, new Date());

  return (
    <article className="tv-card relative flex h-full min-h-0 flex-col px-6 py-5" data-water-card="" data-status={stale ? "fallback" : "ready"}>
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
        <span className="shrink-0 rounded-full border border-gold/40 bg-gold/12 px-3 py-1 text-[13px] font-bold tracking-[0.08em] text-gold uppercase" data-water-status="">
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
        <WaterChart series={station.series} forecast={station.forecast} />
      </div>
      {days.length > 0 ? (
        <ul className="mt-2 grid gap-1" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
          {days.map((point) => (
            <li key={point.timestamp} className="min-w-0 text-center">
              <p className="truncate text-[12px] text-mist" data-water-forecast-day="">
                {dayLabel.format(new Date(Date.parse(point.timestamp) + 24 * 60 * 60 * 1000))}
              </p>
              <p className="font-display text-[18px] leading-none font-semibold tabular-nums" data-water-forecast-value="">{point.levelCm}</p>
              <p className="truncate text-[11px] tracking-[0.02em] text-gold uppercase" data-water-forecast-kind="">{point.kind}</p>
            </li>
          ))}
        </ul>
      ) : null}
      {station.forecastError ? <p className="mt-1 truncate text-[13px] text-mist">{station.forecastError}</p> : null}
      <p className={`mt-1 truncate text-[13px] ${stale ? "text-gold" : "text-mist"}`} data-water-source="">
        {stale ? "Laatste bekende gegevens · " : ""}
        Bijgewerkt {formatAmsterdamTime(station.updatedAt)} · {station.source}
      </p>
    </article>
  );
}
