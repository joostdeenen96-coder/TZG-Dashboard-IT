import { randomUUID } from "node:crypto";
import type pg from "pg";
import { writeAudit } from "../audit/repository.js";
import { getPool } from "../db/pool.js";
import { defaultOrganizationId } from "../db/organization.js";
import { logInfo } from "../log.js";
import { DashboardValidationError } from "../dashboards/model.js";
import { generateScreenToken, hashScreenToken } from "./token.js";
import { heartbeatRetentionDays, screenPresence, type ScreenPresence } from "./status.js";

export type ScreenRecord = {
  id: string;
  name: string;
  slug: string;
  location: string;
  enabled: boolean;
  dashboardId: string | null;
  dashboardName: string | null;
  dashboardSlug: string | null;
  lastSeenAt: string | null;
  status: ScreenPresence;
  hasActiveToken: boolean;
  createdAt: string;
  updatedAt: string;
};

type ScreenRow = {
  id: string;
  name: string;
  slug: string;
  location: string;
  enabled: boolean;
  dashboard_id: string | null;
  dashboard_name: string | null;
  dashboard_slug: string | null;
  last_seen_at: Date | null;
  has_active_token: boolean;
  created_at: Date;
  updated_at: Date;
};

const SELECT_SCREEN = `
  SELECT s.id, s.name, s.slug, s.location, s.enabled, s.dashboard_id, s.last_seen_at, s.created_at, s.updated_at,
         d.name AS dashboard_name, d.slug AS dashboard_slug,
         EXISTS (
           SELECT 1 FROM screen_tokens t
           WHERE t.screen_id = s.id AND t.revoked_at IS NULL AND (t.expires_at IS NULL OR t.expires_at > now())
         ) AS has_active_token
  FROM screens s
  LEFT JOIN dashboards d ON d.id = s.dashboard_id
`;

function slugOf(value: unknown) {
  if (typeof value !== "string") throw new DashboardValidationError("Slug is verplicht.");
  const slug = value.trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new DashboardValidationError("Slug mag alleen kleine letters, cijfers en koppeltekens bevatten.");
  }
  return slug;
}

function text(value: unknown, label: string, max: number, required = true) {
  if (typeof value !== "string") {
    if (required) throw new DashboardValidationError(`${label} is verplicht.`);
    return "";
  }
  const trimmed = value.trim();
  if (required && !trimmed) throw new DashboardValidationError(`${label} is verplicht.`);
  if (trimmed.length > max) throw new DashboardValidationError(`${label} is te lang.`);
  return trimmed;
}

function mapScreen(row: ScreenRow): ScreenRecord {
  const lastSeenAt = row.last_seen_at ? new Date(row.last_seen_at).toISOString() : null;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    location: row.location ?? "",
    enabled: row.enabled,
    dashboardId: row.dashboard_id,
    dashboardName: row.dashboard_name,
    dashboardSlug: row.dashboard_slug,
    lastSeenAt,
    status: screenPresence({ enabled: row.enabled, lastSeenAt }),
    hasActiveToken: row.has_active_token,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

async function audit(
  client: pg.PoolClient,
  action: string,
  entityId: string,
  actor: string,
  details: Record<string, unknown>,
) {
  await writeAudit({ action, entityType: "screen", entityId, actor, details }, client);
}

export class PostgresScreenRepository {
  async list() {
    const organizationId = await defaultOrganizationId();
    const result = await getPool().query<ScreenRow>(
      `${SELECT_SCREEN} WHERE s.organization_id = $1 ORDER BY s.name ASC`,
      [organizationId],
    );
    return result.rows.map(mapScreen);
  }

  async getById(id: string) {
    const organizationId = await defaultOrganizationId();
    const result = await getPool().query<ScreenRow>(
      `${SELECT_SCREEN} WHERE s.organization_id = $1 AND s.id = $2`,
      [organizationId, id],
    );
    const row = result.rows[0];
    return row ? mapScreen(row) : null;
  }

  async create(input: unknown, actor = "admin") {
    const body = asBody(input);
    const name = text(body.name, "Naam", 120);
    const slug = slugOf(body.slug);
    const location = text(body.location, "Locatie", 200, false);
    const enabled = typeof body.enabled === "boolean" ? body.enabled : true;
    const dashboardId = await this.resolveDashboard(body.dashboardId);
    const organizationId = await defaultOrganizationId();
    const id = randomUUID();
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO screens (id, organization_id, dashboard_id, name, slug, location, enabled)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [id, organizationId, dashboardId, name, slug, location, enabled],
      );
      await audit(client, "screen.created", id, actor, { slug, name });
      if (dashboardId) {
        await writeAudit(
          {
            action: "screen.dashboard_assigned",
            entityType: "screen",
            entityId: id,
            actor,
            details: { dashboardId },
          },
          client,
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      if (isUnique(error)) throw new DashboardValidationError(`Slug bestaat al: ${slug}.`);
      throw error;
    } finally {
      client.release();
    }
    logInfo(`scherm geregistreerd ${slug}`);
    return this.require(id);
  }

  async update(id: string, input: unknown, actor = "admin") {
    const current = await this.getById(id);
    if (!current) return null;
    const body = asBody(input);
    const name = "name" in body ? text(body.name, "Naam", 120) : current.name;
    const slug = "slug" in body ? slugOf(body.slug) : current.slug;
    const location = "location" in body ? text(body.location, "Locatie", 200, false) : current.location;
    const enabled = typeof body.enabled === "boolean" ? body.enabled : current.enabled;
    const dashboardTouched = "dashboardId" in body;
    const dashboardId = dashboardTouched ? await this.resolveDashboard(body.dashboardId) : current.dashboardId;
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE screens
         SET name = $2, slug = $3, location = $4, enabled = $5, dashboard_id = $6, updated_at = now()
         WHERE id = $1`,
        [current.id, name, slug, location, enabled, dashboardId],
      );
      await audit(client, "screen.updated", current.id, actor, { slug, enabled });
      if (dashboardTouched && dashboardId !== current.dashboardId) {
        await writeAudit(
          {
            action: "screen.dashboard_assigned",
            entityType: "screen",
            entityId: current.id,
            actor,
            details: { dashboardId },
          },
          client,
        );
        logInfo(`dashboardtoewijzing ${slug}`);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      if (isUnique(error)) throw new DashboardValidationError(`Slug bestaat al: ${slug}.`);
      throw error;
    } finally {
      client.release();
    }
    logInfo(`scherm bijgewerkt ${slug}`);
    return this.require(current.id);
  }

  async delete(id: string, actor = "admin") {
    const current = await this.getById(id);
    if (!current) return false;
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM screens WHERE id = $1", [current.id]);
      await audit(client, "screen.deleted", current.id, actor, { slug: current.slug });
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    logInfo(`scherm verwijderd ${current.slug}`);
    return true;
  }

  async issueToken(screenId: string, actor = "admin") {
    const current = await this.getById(screenId);
    if (!current) return null;
    const issued = generateScreenToken();
    const tokenId = randomUUID();
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const revoked = await client.query<{ id: string }>(
        `UPDATE screen_tokens SET revoked_at = now()
         WHERE screen_id = $1 AND revoked_at IS NULL
         RETURNING id`,
        [current.id],
      );
      for (const row of revoked.rows) {
        await writeAudit(
          {
            action: "token.revoked",
            entityType: "screen_token",
            entityId: row.id,
            actor,
            details: { screenId: current.id, replaced: true },
          },
          client,
        );
      }
      await client.query(
        `INSERT INTO screen_tokens (id, screen_id, token_hash) VALUES ($1, $2, $3)`,
        [tokenId, current.id, issued.tokenHash],
      );
      await writeAudit(
        {
          action: "token.created",
          entityType: "screen_token",
          entityId: tokenId,
          actor,
          details: { screenId: current.id },
        },
        client,
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    logInfo(`token aangemaakt scherm ${current.slug}`);
    return { token: issued.token, tokenId, playerPath: `/player/${issued.token}` };
  }

  async revokeTokens(screenId: string, actor = "admin") {
    const current = await this.getById(screenId);
    if (!current) return null;
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const revoked = await client.query<{ id: string }>(
        `UPDATE screen_tokens SET revoked_at = now()
         WHERE screen_id = $1 AND revoked_at IS NULL
         RETURNING id`,
        [current.id],
      );
      for (const row of revoked.rows) {
        await writeAudit(
          {
            action: "token.revoked",
            entityType: "screen_token",
            entityId: row.id,
            actor,
            details: { screenId: current.id },
          },
          client,
        );
      }
      await client.query("COMMIT");
      logInfo(`token ingetrokken scherm ${current.slug} aantal=${revoked.rowCount ?? 0}`);
      return revoked.rowCount ?? 0;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async authenticate(rawToken: string) {
    const token = rawToken.trim();
    if (!token.startsWith("tzg_") || token.length < 20) return null;
    const result = await getPool().query<{
      screen_id: string;
      enabled: boolean;
      revoked_at: Date | null;
      expires_at: Date | null;
    }>(
      `SELECT t.screen_id, s.enabled, t.revoked_at, t.expires_at
       FROM screen_tokens t
       JOIN screens s ON s.id = t.screen_id
       WHERE t.token_hash = $1`,
      [hashScreenToken(token)],
    );
    const row = result.rows[0];
    if (!row) return { state: "invalid" as const };
    if (row.revoked_at) return { state: "revoked" as const };
    if (row.expires_at && row.expires_at.getTime() <= Date.now()) return { state: "revoked" as const };
    if (!row.enabled) return { state: "disabled" as const };
    const screen = await this.getById(row.screen_id);
    if (!screen) return { state: "invalid" as const };
    return { state: "ok" as const, screen };
  }

  async touch(screenId: string, seenAt = new Date()) {
    await getPool().query("UPDATE screens SET last_seen_at = $2, updated_at = now() WHERE id = $1", [
      screenId,
      seenAt.toISOString(),
    ]);
  }

  async counts() {
    const screens = await this.list();
    const active = screens.filter((item) => item.enabled);
    return {
      active: active.length,
      online: active.filter((item) => item.status === "Online").length,
      offline: active.filter((item) => item.status === "Offline").length,
      neverConnected: active.filter((item) => item.status === "Nooit verbonden").length,
    };
  }

  private async require(id: string) {
    const screen = await this.getById(id);
    if (!screen) throw new Error("Scherm niet leesbaar na opslaan.");
    return screen;
  }

  private async resolveDashboard(value: unknown) {
    if (value === undefined || value === null || value === "") return null;
    if (typeof value !== "string") throw new DashboardValidationError("Dashboard is ongeldig.");
    const organizationId = await defaultOrganizationId();
    const found = await getPool().query("SELECT id FROM dashboards WHERE organization_id = $1 AND id = $2", [
      organizationId,
      value,
    ]);
    if (!found.rows[0]) throw new DashboardValidationError("Dashboard niet gevonden.");
    return value;
  }
}

function asBody(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new DashboardValidationError("Aanvraag is ongeldig.");
  }
  return input as Record<string, unknown>;
}

function isUnique(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

let lastCleanup = 0;

export async function recordHeartbeat(
  screenId: string,
  input: { appVersion?: string; status?: string; metadata?: Record<string, unknown> },
) {
  const appVersion = (input.appVersion ?? "").toString().slice(0, 40);
  const status = (input.status ?? "ok").toString().slice(0, 40);
  const metadata = sanitizeMetadata(input.metadata);
  await getPool().query(
    `INSERT INTO screen_heartbeats (id, screen_id, app_version, status, metadata_json)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [randomUUID(), screenId, appVersion, status, JSON.stringify(metadata)],
  );
  await getPool().query("UPDATE screens SET last_seen_at = now(), updated_at = now() WHERE id = $1", [screenId]);
  await cleanupHeartbeats(screenId);
}

function sanitizeMetadata(metadata: Record<string, unknown> | undefined) {
  if (!metadata || typeof metadata !== "object") return {};
  const player = metadata.player;
  if (typeof player !== "string") return {};
  return { player: player.slice(0, 40) };
}

async function cleanupHeartbeats(screenId: string) {
  const now = Date.now();
  if (now - lastCleanup < 10 * 60 * 1000) {
    await trimScreen(screenId);
    return;
  }
  lastCleanup = now;
  const days = heartbeatRetentionDays();
  await getPool().query(
    `DELETE FROM screen_heartbeats WHERE reported_at < now() - make_interval(days => $1::int)`,
    [days],
  );
  await trimScreen(screenId);
}

async function trimScreen(screenId: string) {
  await getPool().query(
    `DELETE FROM screen_heartbeats
     WHERE id IN (
       SELECT id FROM screen_heartbeats
       WHERE screen_id = $1
       ORDER BY reported_at DESC
       OFFSET 500
     )`,
    [screenId],
  );
}

export function resetHeartbeatCleanupClock() {
  lastCleanup = 0;
}
