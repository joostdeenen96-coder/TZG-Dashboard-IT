import { shipPlanningCredentialsConfigured } from "./client.js";
import { amsterdamYmd } from "./dates.js";
import {
  NEXT_LOAD_LOOKAHEAD_DAYS,
  calendarLoadEntries,
  resetTodayEmptyConfirmation,
  resolveDisplayedLoadPlanning,
  verdictForDay,
} from "./daySelection.js";
import { compareSourceOrder, entityDataRoot } from "./mapRecord.js";
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

function sortByLoadTime(entries: ShipPlanningDay["entries"]) {
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((left, right) => {
      const leftAt = left.entry.loadingAt;
      const rightAt = right.entry.loadingAt;
      if (typeof leftAt === "number" && typeof rightAt === "number" && leftAt !== rightAt) return leftAt - rightAt;
      const bySource = compareSourceOrder(left.entry, right.entry);
      if (bySource !== 0) return bySource;
      return left.index - right.index;
    })
    .map((row) => row.entry);
}

function dayFromQuery(query: ShipPlanningDayQuery, retrievedAt: string, status: ShipPlanningStatus): ShipPlanningDay {
  const published = resolveDisplayedLoadPlanning(query.entries, query.date);
  return {
    date: published.date,
    entries: sortByLoadTime(published.entries),
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

async function queryAhead(deps: ShipPlanningServiceDeps, now: Date, offset: number, date: string) {
  if (offset === 1) return deps.reader.queryTomorrow(now);
  if (!deps.reader.queryDate) return null;
  return deps.reader.queryDate(date);
}

/**
 * Eerstvolgende toekomstige kalenderdag met lading.
 * De zoektocht begint de dag na vandaag. Een onvolledige dag stopt de zoektocht,
 * zodat een bronfout geen latere datum kiest.
 */
async function findNextLoadDay(deps: ShipPlanningServiceDeps, now: Date, limit: number): Promise<ShipPlanningDayQuery | null> {
  for (let offset = 1; offset <= NEXT_LOAD_LOOKAHEAD_DAYS; offset += 1) {
    const date = amsterdamYmd(now, offset);
    const query = await queryAhead(deps, now, offset, date);
    if (!query) throw Object.assign(new Error("geen query voor een volgende laaddag"), { status: 0 });
    const verdict = verdictForDay(query, date);
    if (verdict === "invalid") throw Object.assign(new Error("onvolledige of ongeldige planningsquery"), { status: 0 });
    if (verdict === "empty") continue;
    const loads = calendarLoadEntries(query.entries, date);
    if (loads.length === 0) continue;
    return capQuery({ ...query, entries: loads }, limit);
  }
  return null;
}

async function loadAuto(deps: ShipPlanningServiceDeps): Promise<ShipPlanningResponse> {
  const now = deps.now();
  const retrievedAt = now.toISOString();
  const limit = deps.settings().maxRows;
  if (!deps.credentialsConfigured()) {
    return envelope({
      scope: "auto",
      displayedDay: "tomorrow",
      switchReason: "source-unavailable",
      status: "unavailable",
      todayRecordCount: null,
      tomorrowRecordCount: null,
      todayEmptyConfirmed: false,
      days: [],
      retrievedAt,
    });
  }
  const selected = await findNextLoadDay(deps, now, limit);
  if (!selected) {
    return envelope({
      scope: "auto",
      displayedDay: "tomorrow",
      switchReason: "next-load-day",
      status: "ok",
      todayRecordCount: null,
      tomorrowRecordCount: 0,
      todayEmptyConfirmed: false,
      days: [],
      retrievedAt,
    });
  }
  const day = dayFromQuery(selected, retrievedAt, "ok");
  return envelope({
    scope: "auto",
    displayedDay: "tomorrow",
    switchReason: "next-load-day",
    status: "ok",
    todayRecordCount: null,
    tomorrowRecordCount: day.entries.length,
    todayEmptyConfirmed: false,
    days: [day],
    retrievedAt,
  });
}

function unavailableResponse(scope: ShipPlanningScope, deps: ShipPlanningServiceDeps): ShipPlanningResponse {
  const now = deps.now();
  const retrievedAt = now.toISOString();
  const today = amsterdamYmd(now, 0);
  const tomorrow = amsterdamYmd(now, 1);
  // Auto publiceert geen kalenderdag bij een bronfout. Een placeholder van
  // vandaag zou displayedPlanningDate ten onrechte op vandaag zetten.
  const days =
    scope === "auto"
      ? []
      : scope === "today-and-tomorrow"
        ? [unavailableDay(today, retrievedAt), unavailableDay(tomorrow, retrievedAt)]
        : [unavailableDay(scope === "tomorrow" ? tomorrow : today, retrievedAt)];
  return envelope({
    scope,
    displayedDay: scope === "today" || scope === "today-and-tomorrow" ? "today" : "tomorrow",
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
