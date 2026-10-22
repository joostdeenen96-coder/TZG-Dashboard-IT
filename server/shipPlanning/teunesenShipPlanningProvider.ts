import { authenticateShipPlanning, shipPlanningApi, type ShipPlanningHttpResult } from "./client.js";
import { amsterdamDayBounds, amsterdamYmd } from "./dates.js";
import { mapShipPlanningEntry, orderEntries } from "./mapRecord.js";
import type { ShipPlanningEntry } from "./model.js";
import { SHIP_PLANNING_ENTITY_TYPE_ID, SHIP_PLANNING_QUERY_PATH, shipPlanningQueryBody } from "./pluginQuery.js";

export class ShipPlanningQueryError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ShipPlanningQueryError";
    this.status = status;
  }
}

export type ShipPlanningDayQuery = {
  date: string;
  entityTypeId: number;
  queryPath: string;
  recordCount: number;
  totalCount: number | null;
  entries: ShipPlanningEntry[];
  entities: unknown[];
};

type TokenCache = { token: string; at: number };

const TOKEN_TTL_MS = 10 * 60 * 1000;

function entitiesOf(payload: unknown): unknown[] {
  if (!payload || typeof payload !== "object") return [];
  const row = payload as Record<string, unknown>;
  if (Array.isArray(row.entities)) return row.entities;
  if (Array.isArray(row.resources)) return row.resources;
  return [];
}

function totalCountOf(payload: unknown): number | null {
  if (!payload || typeof payload !== "object") return null;
  const value = (payload as Record<string, unknown>).totalCount;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function continuationOf(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const row = payload as Record<string, unknown>;
  const value = row.continuation ?? row.continuationToken;
  return typeof value === "string" && value.trim() ? value : null;
}

/**
 * Productieprovider. Auth en query zijn de al bewezen Tarasa-aanroepen.
 * Eén tokencache per proces; 401 vernieuwt één keer.
 */
export class TeunesenShipPlanningProvider {
  private tokenCache: TokenCache | null = null;
  private authentications = 0;
  private queries = 0;
  private readonly fetchImpl: typeof fetch;

  constructor(fetchImpl: typeof fetch = fetch) {
    this.fetchImpl = fetchImpl;
  }

  authenticationCount() {
    return this.authentications;
  }

  queryCount() {
    return this.queries;
  }

  async authenticate() {
    const login = await authenticateShipPlanning(this.fetchImpl);
    this.authentications += 1;
    if (!login.token) {
      throw new ShipPlanningQueryError(login.status, `authenticatie mislukt (HTTP ${login.status || 0})`);
    }
    this.tokenCache = { token: login.token, at: Date.now() };
    return { totpRequired: login.totpRequired, status: login.status };
  }

  private async token(force = false) {
    if (!force && this.tokenCache && Date.now() - this.tokenCache.at < TOKEN_TTL_MS) {
      return this.tokenCache.token;
    }
    await this.authenticate();
    if (!this.tokenCache) throw new ShipPlanningQueryError(0, "authenticatie mislukt (HTTP 0)");
    return this.tokenCache.token;
  }

  private async postQuery(body: Record<string, unknown>): Promise<ShipPlanningHttpResult> {
    const send = async (bearer: string) => {
      this.queries += 1;
      return shipPlanningApi("POST", SHIP_PLANNING_QUERY_PATH, bearer, body, this.fetchImpl);
    };
    let bearer = await this.token();
    let response = await send(bearer);
    if (response.status === 401) {
      this.tokenCache = null;
      bearer = await this.token(true);
      response = await send(bearer);
    }
    if (response.status !== 200) {
      throw new ShipPlanningQueryError(response.status, `query entityTypeId ${SHIP_PLANNING_ENTITY_TYPE_ID} HTTP ${response.status}`);
    }
    return response;
  }

  async queryDate(ymd: string, pageSize = 999, followContinuation = true): Promise<ShipPlanningDayQuery> {
    const bounds = amsterdamDayBounds(ymd);
    const firstBody = shipPlanningQueryBody(bounds.startMs, bounds.endMs, pageSize);
    const first = await this.postQuery(firstBody);
    const entities = entitiesOf(first.json);
    let continuation = continuationOf(first.json);
    let pages = 1;
    while (followContinuation && continuation && pages < 5) {
      const next = await this.postQuery({ ...firstBody, continuationToken: continuation });
      entities.push(...entitiesOf(next.json));
      continuation = continuationOf(next.json);
      pages += 1;
    }
    const entries = orderEntries(entities.map((entity) => mapShipPlanningEntry(entity)));
    return {
      date: ymd,
      entityTypeId: SHIP_PLANNING_ENTITY_TYPE_ID,
      queryPath: SHIP_PLANNING_QUERY_PATH,
      recordCount: entities.length,
      totalCount: totalCountOf(first.json),
      entries,
      entities,
    };
  }

  async queryTomorrow(now: Date = new Date(), pageSize = 999) {
    return this.queryDate(amsterdamYmd(now, 1), pageSize);
  }

  async queryToday(now: Date = new Date(), pageSize = 999) {
    return this.queryDate(amsterdamYmd(now, 0), pageSize);
  }
}
