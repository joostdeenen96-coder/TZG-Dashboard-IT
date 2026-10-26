import { formatAmsterdamDate } from "./dates.js";
import type { ShipPlanningDayQuery } from "./teunesenShipPlanningProvider.js";

export type TodayVerdict = "active" | "empty" | "invalid";

/** Kalenderdagen na vandaag waarin een dag met lading gezocht wordt. Lege dagen bepaalt de bron. */
export const NEXT_LOAD_LOOKAHEAD_DAYS = 6;

type TimedEntry = { loadingAt: number | null };

/** Zelfde zichtbaarheidsregel als het bord: een rit zonder laaddatum blijft bij deze dag. */
export function loadingEntriesOnDay<T extends TimedEntry>(entries: T[], day: string) {
  return entries.filter((entry) => {
    if (typeof entry.loadingAt !== "number" || !Number.isFinite(entry.loadingAt)) return true;
    return formatAmsterdamDate(entry.loadingAt) === day;
  });
}

export function dayHasLoadingEntries(entries: TimedEntry[], day: string) {
  return loadingEntriesOnDay(entries, day).length > 0;
}

/** Testfixtures gebruiken kleine offsets. Een echte laaddatum is een epoch in milliseconden. */
function isCalendarLoadInstant(value: number) {
  return value >= 1_000_000_000_000;
}

/**
 * Publicatiedatum van de laadplanning.
 * Als de gekozen dag zelf lading heeft, blijft die datum leidend.
 * Bevat de set alleen lading van één andere kalenderdag, dan is die laaddag de titel.
 */
export function resolveDisplayedLoadPlanning<T extends TimedEntry>(entries: T[], queryDate: string) {
  const realDays = new Set<string>();
  for (const entry of entries) {
    if (typeof entry.loadingAt !== "number" || !Number.isFinite(entry.loadingAt)) continue;
    if (!isCalendarLoadInstant(entry.loadingAt)) continue;
    realDays.add(formatAmsterdamDate(entry.loadingAt));
  }
  const date = realDays.has(queryDate) || realDays.size !== 1 ? queryDate : [...realDays][0]!;
  const visible = entries.filter((entry) => {
    if (typeof entry.loadingAt !== "number" || !Number.isFinite(entry.loadingAt)) return true;
    if (!isCalendarLoadInstant(entry.loadingAt)) return true;
    return formatAmsterdamDate(entry.loadingAt) === date;
  });
  return { date, entries: visible };
}

/**
 * Vandaag is afgerond als elke zichtbare lading al begonnen is.
 * Een rit zonder laadtijd houdt de dag open. Alleen lossingen tellen niet als lading.
 */
export function todayPlanningIsFinished(entries: TimedEntry[], day: string, now: Date) {
  const visible = loadingEntriesOnDay(entries, day);
  if (visible.length === 0) return entries.length > 0;
  const nowMs = now.getTime();
  return visible.every((entry) => typeof entry.loadingAt === "number" && entry.loadingAt < nowMs);
}

/**
 * Leeg telt alleen bij een volledige, technische response van precies deze dag.
 * totalCount moet 0 zijn. Een ontbrekende totalCount of afgekapte pagination is ongeldig.
 */
export function verdictForDay(query: ShipPlanningDayQuery, expectedDate: string): TodayVerdict {
  if (query.date !== expectedDate) return "invalid";
  if (query.entries.length > 0) return "active";
  if (query.complete && query.totalCount === 0 && query.recordCount === 0) return "empty";
  return "invalid";
}

export function activePlanningDay(input: { todayHasActiveEntries: boolean; todayConfirmedEmpty: boolean }) {
  if (input.todayHasActiveEntries) return "today" as const;
  if (input.todayConfirmedEmpty) return "tomorrow" as const;
  return "today" as const;
}

type Streak = { date: string; count: number };

let streak: Streak = { date: "", count: 0 };

export function resetTodayEmptyConfirmation() {
  streak = { date: "", count: 0 };
}

export function todayEmptyStreak() {
  return streak.count;
}

/** Alleen aanroepen na een verse, gevalideerde vandaag-query. Ongeldig laat de teller staan. */
export function observeTodayQuery(input: { date: string; verdict: TodayVerdict; confirmationCount: number }) {
  if (streak.date !== input.date) streak = { date: input.date, count: 0 };
  if (input.verdict === "invalid") return { streak: streak.count, confirmed: false };
  if (input.verdict === "active") {
    streak = { date: input.date, count: 0 };
    return { streak: 0, confirmed: false };
  }
  const count = streak.count + 1;
  streak = { date: input.date, count };
  const needed = Math.max(1, input.confirmationCount);
  return { streak: count, confirmed: count >= needed };
}

export function emptyConfirmationCountFromEnv(raw = process.env.SHIP_PLANNING_EMPTY_CONFIRMATION_COUNT) {
  if (raw === undefined || raw.trim() === "") return 2;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 10) return 2;
  return parsed;
}
