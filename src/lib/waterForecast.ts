import { formatAmsterdamTime, formatPublicationDate } from "./format";
import type { WaterForecastPoint } from "../types";

export type ForecastClock = "absolute" | "shifted";

const DAY_MS = 24 * 60 * 60 * 1000;
const MORNING_MINUTES = 6 * 60;

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

export function formatWaterPointTooltip(
  station: string,
  mode: "Gemeten" | "Voorspelling",
  timestamp: string,
  levelCm: number,
) {
  return [station, mode, formatPublicationDate(timestamp), formatAmsterdamTime(timestamp), `${levelCm} cm`].join("\n");
}
