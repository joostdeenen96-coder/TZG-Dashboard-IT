import { formatAmsterdamTime, formatPublicationDate } from "./format";
import type { WaterForecastPoint } from "../types";

export type ForecastClock = "absolute" | "shifted";

const DAY_MS = 24 * 60 * 60 * 1000;
const MORNING_MINUTES = 6 * 60;
/** Weergavevenster. Langer dan dit wordt niet getekend; korter wordt niet aangevuld. */
export const MAX_FORECAST_HORIZON_DAYS = 42;

export function forecastClockFor(station: { id: string; forecastClock?: string | null }): ForecastClock {
  if (station.forecastClock === "absolute" || station.forecastClock === "shifted") return station.forecastClock;
  return station.id === "maxau" ? "absolute" : "shifted";
}

/** Weergavetijd. PEGELONLINE-WV blijft +24 uur; RLP-Maxau blijft op het echte tijdstip. */
export function displayMillis(timestamp: string, clock: ForecastClock) {
  const time = Date.parse(timestamp);
  if (!Number.isFinite(time)) return Number.NaN;
  return clock === "shifted" ? time + DAY_MS : time;
}

export function alignForecast(points: WaterForecastPoint[], afterMs: number, clock: ForecastClock) {
  const aligned: WaterForecastPoint[] = [];
  for (const point of points) {
    const time = Date.parse(point.timestamp);
    if (!Number.isFinite(time)) continue;
    const next = clock === "shifted" ? time + DAY_MS : time;
    if (next <= afterMs) continue;
    aligned.push(clock === "shifted" ? { ...point, timestamp: new Date(next).toISOString() } : point);
  }
  aligned.sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp));
  return aligned;
}

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

function addCalendarDays(key: string, days: number) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return key;
  const cursor = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  const year = cursor.getUTCFullYear();
  const month = String(cursor.getUTCMonth() + 1).padStart(2, "0");
  const day = String(cursor.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export type ForecastHorizon = {
  points: WaterForecastPoint[];
  endKey: string | null;
  dayCount: number;
  reachesSixWeeks: boolean;
};

/**
 * Houdt de officiële punten tot en met 42 Amsterdam-dagen vooruit.
 * Er worden geen dagen bijverzonnen en het laatste echte punt binnen dat venster blijft staan.
 */
export function capForecastHorizon(points: WaterForecastPoint[], now: Date, clock: ForecastClock): ForecastHorizon {
  const today = amsterdamClock(now).key;
  const lastAllowed = addCalendarDays(today, MAX_FORECAST_HORIZON_DAYS);
  const kept: WaterForecastPoint[] = [];
  const days = new Set<string>();
  for (const point of points) {
    const shown = displayMillis(point.timestamp, clock);
    if (!Number.isFinite(shown)) continue;
    const key = amsterdamClock(new Date(shown)).key;
    if (!key || key > lastAllowed) continue;
    kept.push(point);
    if (shown > now.getTime()) days.add(key);
  }
  const endKey = [...days].sort((left, right) => left.localeCompare(right)).at(-1) ?? null;
  return {
    points: kept,
    endKey,
    dayCount: days.size,
    reachesSixWeeks: days.size >= MAX_FORECAST_HORIZON_DAYS,
  };
}

export function formatHorizonDay(key: string) {
  return new Intl.DateTimeFormat("nl-NL", {
    timeZone: "Europe/Amsterdam",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${key}T12:00:00Z`));
}

export function outlookCaption(horizon: ForecastHorizon, stale = false) {
  const fresh = !horizon.endKey
    ? "Zesweekse verwachting niet beschikbaar"
    : horizon.reachesSixWeeks
      ? `Horizon tot ${formatHorizonDay(horizon.endKey)}`
      : `Horizon tot ${formatHorizonDay(horizon.endKey)}. Zesweekse verwachting niet beschikbaar.`;
  return stale ? `${fresh} Verouderd.` : fresh;
}

/** Eerste en laatste punt blijven staan, zodat een lange reeks leesbaar wordt zonder het einde in te korten. */
export function thinPoints<T>(points: T[], max: number) {
  if (points.length <= max || max < 2) return points;
  const last = points.length - 1;
  const indexes = new Set<number>([0, last]);
  const step = last / (max - 1);
  for (let index = 1; index < max - 1; index += 1) indexes.add(Math.round(index * step));
  return [...indexes].sort((left, right) => left - right).map((index) => points[index]!);
}

export function selectDailyForecast(points: WaterForecastPoint[], now: Date, clock: ForecastClock) {
  const today = amsterdamClock(now).key;
  const byDay = new Map<string, WaterForecastPoint>();
  for (const point of points) {
    const stamp = new Date(point.timestamp);
    if (!Number.isFinite(stamp.getTime())) continue;
    const shown = new Date(displayMillis(point.timestamp, clock));
    if (!Number.isFinite(shown.getTime())) continue;
    const shownClock = amsterdamClock(shown);
    if (shownClock.key <= today) continue;
    const current = byDay.get(shownClock.key);
    if (!current) {
      byDay.set(shownClock.key, point);
      continue;
    }
    const currentMinutes =
      clock === "shifted"
        ? amsterdamClock(new Date(current.timestamp)).minutes
        : amsterdamClock(new Date(displayMillis(current.timestamp, clock))).minutes;
    const currentDistance = Math.abs(currentMinutes - MORNING_MINUTES);
    const nextDistance = Math.abs(shownClock.minutes - MORNING_MINUTES);
    if (nextDistance < currentDistance) byDay.set(shownClock.key, point);
  }
  return [...byDay.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(0, 5)
    .map(([, point]) => point);
}

export function formatWaterPointTooltip(input: {
  station: string;
  mode: "Gemeten" | "Voorspelling" | "Inschatting";
  timestamp: string;
  levelCm: number;
  source?: string | null;
  issuedAt?: string | null;
}) {
  const lines = [
    input.station,
    input.mode,
    formatPublicationDate(input.timestamp),
    formatAmsterdamTime(input.timestamp),
    `${input.levelCm} cm`,
  ];
  if (input.source) lines.push(input.source);
  if (input.issuedAt) {
    lines.push(`Gepubliceerd ${formatPublicationDate(input.issuedAt)} ${formatAmsterdamTime(input.issuedAt)}`);
  }
  return lines.join("\n");
}
