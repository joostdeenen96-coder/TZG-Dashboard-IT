import { shipPlanningCredentialsConfigured } from "./client.js";
import { amsterdamYmd } from "./dates.js";
import {
  NEXT_LOAD_LOOKAHEAD_DAYS,
  activePlanningDay,
  dayHasLoadingEntries,
  emptyConfirmationCountFromEnv,
  observeTodayQuery,
  resetTodayEmptyConfirmation,
  resolveDisplayedLoadPlanning,
  todayPlanningIsFinished,
  verdictForDay,
} from "./daySelection.js";
import { entityDataRoot } from "./mapRecord.js";
import type {
  ShipPlanningDay,
  ShipPlanningDisplayedDay,
  ShipPlanningResponse,
  ShipPlanningScope,
  ShipPlanningStatus,
  ShipPlanningSwitchReason,
} from "./model.js";
import { getShipPlanningSettings, type ShipPlanningSettings } from "./settings.js";
import { TeunesenShipPlanningProvider, type ShipPlanningDayQuery } from "./teunesenShipPlanningProvider.js";
import { logWarn } from "../log.js";

export type ShipPlanningReader = {
  queryToday(now?: Date, pageSize?: number): Promise<ShipPlanningDayQuery>;
  queryTomorrow(now?: Date, pageSize?: number): Promise<ShipPlanningDayQuery>;
  queryDate?(ymd: string, pageSize?: number): Promise<ShipPlanningDayQuery>;
};

type CacheHit = {
  at: number;
  response: ShipPlanningResponse;
};

export type ShipPlanningServiceDeps = {
  reader: ShipPlanningReader;
  now: () => Date;
  settings: () => ShipPlanningSettings;
  credentialsConfigured: () => boolean;
  refreshMs?: number;
  emptyConfirmationCount?: number;
};

const cache = new Map<string, CacheHit>();
const inflight = new Map<string, Promise<ShipPlanningResponse>>();
let lastStatus: ShipPlanningStatus | "disabled" | null = null;

export function resetShipPlanningCache() {
  cache.clear();
  inflight.clear();
  lastStatus = null;
  resetTodayEmptyConfirmation();
}

export function shipPlanningLastStatus() {
  return lastStatus;
}

function cacheKey(scope: ShipPlanningScope, now: Date) {
  return `${scope}:${amsterdamYmd(now, 0)}`;
}

function sourceUpdatedAt(entities: unknown[]) {
  let max = Number.NEGATIVE_INFINITY;
  for (const entity of entities) {
    const value = entityDataRoot(entity).editedDate;
    if (typeof value === "number" && Number.isFinite(value) && value > max) max = value;
  }
  if (!Number.isFinite(max)) return null;
  return new Date(max).toISOString();
}

function dayFromQuery(query: ShipPlanningDayQuery, retrievedAt: string, status: ShipPlanningStatus): ShipPlanningDay {
  const published = resolveDisplayedLoadPlanning(query.entries, query.date);
  return {
    date: published.date,
    entries: published.entries,
    retrievedAt,
    sourceUpdatedAt: sourceUpdatedAt(query.entities),
    status,
  };
}

function unavailableDay(date: string, retrievedAt: string): ShipPlanningDay {
  return { date, entries: [], retrievedAt, sourceUpdatedAt: null, status: "unavailable" };
}

function envelope(input: {
  scope: ShipPlanningScope;
  displayedDay: ShipPlanningDisplayedDay;
  switchReason: ShipPlanningSwitchReason;
  status: ShipPlanningResponse["status"];
  todayRecordCount: number | null;
  tomorrowRecordCount: number | null;
  todayEmptyConfirmed: boolean;
  days: ShipPlanningDay[];
  retrievedAt: string;
}): ShipPlanningResponse {
  const displayedPlanningDate = input.days.find((day) => day.date)?.date ?? "";
  return { ...input, displayedPlanningDate };
}

function asStale(response: ShipPlanningResponse): ShipPlanningResponse {
  return {
    ...response,
    status: "stale",
    switchReason: response.displayedDay === "today" ? "stale-today" : response.switchReason,
    days: response.days.map((day) => ({ ...day, status: day.entries.length ? "stale" : day.status })),
  };
}

function capQuery(query: ShipPlanningDayQuery, limit: number): ShipPlanningDayQuery {
  return { ...query, entries: query.entries.slice(0, limit) };
}

function confirmationCount(deps: ShipPlanningServiceDeps) {
  return deps.emptyConfirmationCount ?? emptyConfirmationCountFromEnv();
}

async function loadManual(scope: Exclude<ShipPlanningScope, "auto">, deps: ShipPlanningServiceDeps): Promise<ShipPlanningResponse> {
  const now = deps.now();
  const retrievedAt = now.toISOString();
  const settings = deps.settings();
  const today = amsterdamYmd(now, 0);
  const tomorrow = amsterdamYmd(now, 1);
  if (!deps.credentialsConfigured()) {
    const days =
      scope === "today-and-tomorrow"
        ? [unavailableDay(today, retrievedAt), unavailableDay(tomorrow, retrievedAt)]
        : [unavailableDay(scope === "today" ? today : tomorrow, retrievedAt)];
    return envelope({
      scope,
      displayedDay: scope === "tomorrow" ? "tomorrow" : "today",
      switchReason: "source-unavailable",
      status: "unavailable",
      todayRecordCount: null,
      tomorrowRecordCount: null,
      todayEmptyConfirmed: false,
      days,
      retrievedAt,
    });
  }
  const limit = settings.maxRows;
  if (scope === "today") {
    const query = capQuery(await deps.reader.queryToday(now), limit);
    return envelope({
      scope,
      displayedDay: "today",
      switchReason: "manual-override",
      status: "ok",
      todayRecordCount: query.entries.length,
      tomorrowRecordCount: null,
      todayEmptyConfirmed: false,
      days: [dayFromQuery(query, retrievedAt, "ok")],
      retrievedAt,
    });
  }
  if (scope === "today-and-tomorrow") {
    const [todayQuery, tomorrowQuery] = await Promise.all([
      deps.reader.queryToday(now),
      deps.reader.queryTomorrow(now),
    ]);
    const todayCapped = capQuery(todayQuery, limit);
    const tomorrowCapped = capQuery(tomorrowQuery, limit);
    return envelope({
      scope,
      displayedDay: "today",
      switchReason: "manual-override",
      status: "ok",
      todayRecordCount: todayCapped.entries.length,
      tomorrowRecordCount: tomorrowCapped.entries.length,
      todayEmptyConfirmed: false,
      days: [dayFromQuery(todayCapped, retrievedAt, "ok"), dayFromQuery(tomorrowCapped, retrievedAt, "ok")],
      retrievedAt,
    });
  }
  const query = capQuery(await deps.reader.queryTomorrow(now), limit);
  return envelope({
    scope,
    displayedDay: "tomorrow",
    switchReason: "manual-override",
    status: "ok",
    todayRecordCount: null,
    tomorrowRecordCount: query.entries.length,
    todayEmptyConfirmed: false,
    days: [dayFromQuery(query, retrievedAt, "ok")],
    retrievedAt,
  });
}

type LoadLookahead = {
  selected: ShipPlanningDayQuery | null;
  tomorrow: ShipPlanningDayQuery;
};

async function queryAhead(deps: ShipPlanningServiceDeps, now: Date, offset: number, date: string) {
  if (offset === 1) return deps.reader.queryTomorrow(now);
  if (!deps.reader.queryDate) return null;
  return deps.reader.queryDate(date);
}

/** Eerstvolgende kalenderdag met lading. Lege dagen en dagen met alleen lossingen slaat de bron over. */
async function findNextLoadDay(deps: ShipPlanningServiceDeps, now: Date, limit: number): Promise<LoadLookahead> {
  let tomorrow: ShipPlanningDayQuery | null = null;
  for (let offset = 1; offset <= NEXT_LOAD_LOOKAHEAD_DAYS; offset += 1) {
    const date = amsterdamYmd(now, offset);
    const query = await queryAhead(deps, now, offset, date);
    if (!query) break;
    if (offset === 1) tomorrow = query;
    const verdict = verdictForDay(query, date);
    if (verdict === "invalid") {
      if (offset === 1) throw Object.assign(new Error("onvolledige of ongeldige morgenquery"), { status: 0 });
      break;
    }
    if (verdict === "empty") continue;
    const capped = capQuery(query, limit);
    if (dayHasLoadingEntries(capped.entries, date)) {
      if (!tomorrow) throw Object.assign(new Error("onvolledige of ongeldige morgenquery"), { status: 0 });
      return { selected: capped, tomorrow };
    }
  }
  if (!tomorrow) throw Object.assign(new Error("onvolledige of ongeldige morgenquery"), { status: 0 });
  return { selected: null, tomorrow };
}

async function loadAuto(deps: ShipPlanningServiceDeps): Promise<ShipPlanningResponse> {
  const now = deps.now();
  const retrievedAt = now.toISOString();
  const todayDate = amsterdamYmd(now, 0);
  const limit = deps.settings().maxRows;
  if (!deps.credentialsConfigured()) {
    return envelope({
      scope: "auto",
      displayedDay: "today",
      switchReason: "source-unavailable",
      status: "unavailable",
      todayRecordCount: null,
      tomorrowRecordCount: null,
      todayEmptyConfirmed: false,
      days: [unavailableDay(todayDate, retrievedAt)],
      retrievedAt,
    });
  }
  const todayQuery = await deps.reader.queryToday(now);
  const verdict = verdictForDay(todayQuery, todayDate);
  if (verdict === "invalid") {
    throw Object.assign(new Error("onvolledige of ongeldige vandaagquery"), { status: 0 });
  }
  const observed = observeTodayQuery({ date: todayDate, verdict, confirmationCount: confirmationCount(deps) });
  const todayCapped = capQuery(todayQuery, limit);
  const finished = verdict === "active" && todayPlanningIsFinished(todayCapped.entries, todayDate, now);
  const displayed = activePlanningDay({
    todayHasActiveEntries: verdict === "active" && !finished,
    todayConfirmedEmpty: observed.confirmed,
  });
  const todayActive = () =>
    envelope({
      scope: "auto",
      displayedDay: "today",
      switchReason: "today-active",
      status: "ok",
      todayRecordCount: todayCapped.entries.length,
      tomorrowRecordCount: null,
      todayEmptyConfirmed: false,
      days: [dayFromQuery(todayCapped, retrievedAt, "ok")],
      retrievedAt,
    });
  if (displayed === "today" && !finished) return todayActive();
  let lookahead: LoadLookahead;
  try {
    lookahead = await findNextLoadDay(deps, now, limit);
  } catch (error) {
    if (!finished) throw error;
    return todayActive();
  }
  if (!lookahead.selected) {
    if (finished) return todayActive();
    const tomorrowCapped = capQuery(lookahead.tomorrow, limit);
    return envelope({
      scope: "auto",
      displayedDay: "today",
      switchReason: "today-empty-confirmed",
      status: "ok",
      todayRecordCount: 0,
      tomorrowRecordCount: tomorrowCapped.entries.length,
      todayEmptyConfirmed: true,
      days: [dayFromQuery(todayCapped, retrievedAt, "ok"), dayFromQuery(tomorrowCapped, retrievedAt, "ok")],
      retrievedAt,
    });
  }
  return envelope({
    scope: "auto",
    displayedDay: "tomorrow",
    switchReason: finished ? "next-load-day" : "today-empty-confirmed",
    status: "ok",
    todayRecordCount: finished ? todayCapped.entries.length : 0,
    tomorrowRecordCount: lookahead.selected.entries.length,
    todayEmptyConfirmed: !finished,
    days: [dayFromQuery(lookahead.selected, retrievedAt, "ok")],
    retrievedAt,
  });
}

function unavailableResponse(scope: ShipPlanningScope, deps: ShipPlanningServiceDeps): ShipPlanningResponse {
  const now = deps.now();
  const retrievedAt = now.toISOString();
  const today = amsterdamYmd(now, 0);
  const tomorrow = amsterdamYmd(now, 1);
  const days =
    scope === "today-and-tomorrow"
      ? [unavailableDay(today, retrievedAt), unavailableDay(tomorrow, retrievedAt)]
      : [unavailableDay(scope === "tomorrow" ? tomorrow : today, retrievedAt)];
  return envelope({
    scope,
    displayedDay: scope === "tomorrow" ? "tomorrow" : "today",
    switchReason: "source-unavailable",
    status: "unavailable",
    todayRecordCount: null,
    tomorrowRecordCount: null,
    todayEmptyConfirmed: false,
    days,
    retrievedAt,
  });
}

export async function getShipPlanning(
  scope: ShipPlanningScope,
  deps: ShipPlanningServiceDeps = defaultDeps(),
): Promise<ShipPlanningResponse> {
  const settings = deps.settings();
  const now = deps.now();
  if (!settings.enabled) {
    lastStatus = "disabled";
    return envelope({
      scope,
      displayedDay: scope === "tomorrow" ? "tomorrow" : "today",
      switchReason: "manual-override",
      status: "disabled",
      todayRecordCount: null,
      tomorrowRecordCount: null,
      todayEmptyConfirmed: false,
      days: [],
      retrievedAt: now.toISOString(),
    });
  }
  const refreshMs = deps.refreshMs ?? settings.refreshIntervalSeconds * 1000;
  const key = cacheKey(scope, now);
  const hit = cache.get(key);
  if (hit && hit.response.status === "ok" && now.getTime() - hit.at < refreshMs) {
    lastStatus = "ok";
    return hit.response;
  }
  const pending = inflight.get(key);
  if (pending) return pending;
  const job = (scope === "auto" ? loadAuto(deps) : loadManual(scope, deps))
    .then((response) => {
      cache.set(key, { at: deps.now().getTime(), response });
      lastStatus = "ok";
      return response;
    })
    .catch((error: unknown) => {
      const status = error && typeof error === "object" && "status" in error ? Number(error.status) : 0;
      logWarn(`schepenplanning niet ververst (HTTP ${Number.isFinite(status) ? status : 0})`, {
        event: "shipPlanning.query",
      });
      if (hit) {
        const stale = asStale(hit.response);
        lastStatus = "stale";
        return stale;
      }
      lastStatus = "unavailable";
      return unavailableResponse(scope, deps);
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, job);
  return job;
}

let sharedProvider: TeunesenShipPlanningProvider | null = null;

function defaultDeps(): ShipPlanningServiceDeps {
  if (!sharedProvider) sharedProvider = new TeunesenShipPlanningProvider();
  return {
    reader: sharedProvider,
    now: () => new Date(),
    settings: getShipPlanningSettings,
    credentialsConfigured: shipPlanningCredentialsConfigured,
  };
}

export function getShipPlanningSourceHealth() {
  const settings = getShipPlanningSettings();
  const lastChecked = new Date().toISOString();
  if (!settings.enabled) {
    return {
      id: "ship-planning",
      name: "Schepenplanning",
      status: "disabled" as const,
      detail: "uitgeschakeld",
      lastChecked,
    };
  }
  if (!shipPlanningCredentialsConfigured()) {
    return {
      id: "ship-planning",
      name: "Schepenplanning",
      status: "unavailable" as const,
      detail: "niet geconfigureerd",
      lastChecked,
    };
  }
  if (lastStatus === "ok") {
    return {
      id: "ship-planning",
      name: "Schepenplanning",
      status: "healthy" as const,
      detail: "cache actueel",
      lastChecked,
    };
  }
  if (lastStatus === "stale") {
    return {
      id: "ship-planning",
      name: "Schepenplanning",
      status: "stale" as const,
      detail: "laatste geldige planning",
      lastChecked,
    };
  }
  return {
    id: "ship-planning",
    name: "Schepenplanning",
    status: "unavailable" as const,
    detail: lastStatus === "disabled" ? "uitgeschakeld" : "geen planning",
    lastChecked,
  };
}
