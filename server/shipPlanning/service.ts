import { shipPlanningCredentialsConfigured } from "./client.js";
import { amsterdamYmd } from "./dates.js";
import { entityDataRoot } from "./mapRecord.js";
import type { ShipPlanningDay, ShipPlanningResponse, ShipPlanningScope, ShipPlanningStatus } from "./model.js";
import { getShipPlanningSettings, type ShipPlanningSettings } from "./settings.js";
import { TeunesenShipPlanningProvider, type ShipPlanningDayQuery } from "./teunesenShipPlanningProvider.js";
import { logWarn } from "../log.js";

export type ShipPlanningReader = {
  queryToday(now?: Date, pageSize?: number): Promise<ShipPlanningDayQuery>;
  queryTomorrow(now?: Date, pageSize?: number): Promise<ShipPlanningDayQuery>;
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
};

const cache = new Map<string, CacheHit>();
const inflight = new Map<string, Promise<ShipPlanningResponse>>();
let lastStatus: ShipPlanningStatus | "disabled" | null = null;

export function resetShipPlanningCache() {
  cache.clear();
  inflight.clear();
  lastStatus = null;
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
  return {
    date: query.date,
    entries: query.entries,
    retrievedAt,
    sourceUpdatedAt: sourceUpdatedAt(query.entities),
    status,
  };
}

function unavailableDay(date: string, retrievedAt: string): ShipPlanningDay {
  return { date, entries: [], retrievedAt, sourceUpdatedAt: null, status: "unavailable" };
}

function asStale(response: ShipPlanningResponse): ShipPlanningResponse {
  return {
    ...response,
    status: "stale",
    days: response.days.map((day) => ({ ...day, status: day.entries.length ? "stale" : day.status })),
  };
}

async function loadScope(scope: ShipPlanningScope, deps: ShipPlanningServiceDeps): Promise<ShipPlanningResponse> {
  const now = deps.now();
  const retrievedAt = now.toISOString();
  const settings = deps.settings();
  const limit = settings.maxRows;
  if (!deps.credentialsConfigured()) {
    const today = amsterdamYmd(now, 0);
    const tomorrow = amsterdamYmd(now, 1);
    const days =
      scope === "today-and-tomorrow"
        ? [unavailableDay(today, retrievedAt), unavailableDay(tomorrow, retrievedAt)]
        : [unavailableDay(tomorrow, retrievedAt)];
    return { scope, status: "unavailable", days, retrievedAt };
  }
  const cap = (query: ShipPlanningDayQuery) => ({
    ...query,
    entries: query.entries.slice(0, limit),
  });
  if (scope === "today-and-tomorrow") {
    const [today, tomorrow] = await Promise.all([deps.reader.queryToday(now), deps.reader.queryTomorrow(now)]);
    return {
      scope,
      status: "ok",
      retrievedAt,
      days: [dayFromQuery(cap(today), retrievedAt, "ok"), dayFromQuery(cap(tomorrow), retrievedAt, "ok")],
    };
  }
  const tomorrow = await deps.reader.queryTomorrow(now);
  return {
    scope,
    status: "ok",
    retrievedAt,
    days: [dayFromQuery(cap(tomorrow), retrievedAt, "ok")],
  };
}

export async function getShipPlanning(
  scope: ShipPlanningScope,
  deps: ShipPlanningServiceDeps = defaultDeps(),
): Promise<ShipPlanningResponse> {
  const settings = deps.settings();
  const now = deps.now();
  if (!settings.enabled) {
    lastStatus = "disabled";
    return { scope, status: "disabled", days: [], retrievedAt: now.toISOString() };
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
  const job = loadScope(scope, deps)
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
      const retrievedAt = deps.now().toISOString();
      const today = amsterdamYmd(deps.now(), 0);
      const tomorrow = amsterdamYmd(deps.now(), 1);
      const days =
        scope === "today-and-tomorrow"
          ? [unavailableDay(today, retrievedAt), unavailableDay(tomorrow, retrievedAt)]
          : [unavailableDay(tomorrow, retrievedAt)];
      return { scope, status: "unavailable" as const, days, retrievedAt };
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
