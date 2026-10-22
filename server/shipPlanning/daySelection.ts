import type { ShipPlanningDayQuery } from "./teunesenShipPlanningProvider.js";

export type TodayVerdict = "active" | "empty" | "invalid";

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
