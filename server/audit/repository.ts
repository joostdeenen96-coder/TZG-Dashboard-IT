import { randomUUID } from "node:crypto";
import type pg from "pg";
import { getPool } from "../db/pool.js";
import { defaultOrganizationId } from "../db/organization.js";
import { logError, logInfo } from "../log.js";

export type AuditEntry = {
  action: string;
  entityType: string;
  entityId: string;
  actor: string;
  details?: Record<string, unknown>;
};

export type AuditRow = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  actor: string;
  details: Record<string, unknown>;
  createdAt: string;
};

function safeDetails(details: Record<string, unknown> | undefined) {
  const source = details ?? {};
  const blocked = ["token", "tokenHash", "password", "secret", "authorization", "clientSecret"];
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (blocked.some((word) => key.toLowerCase().includes(word.toLowerCase()))) continue;
    next[key] = value;
  }
  return next;
}

export async function writeAudit(entry: AuditEntry, client?: pg.PoolClient) {
  const runner = client ?? getPool();
  try {
    const organizationId = await defaultOrganizationId();
    await runner.query(
      `INSERT INTO audit_logs (id, organization_id, action, entity_type, entity_id, actor, details_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        randomUUID(),
        organizationId,
        entry.action,
        entry.entityType,
        entry.entityId,
        entry.actor,
        JSON.stringify(safeDetails(entry.details)),
      ],
    );
    logInfo(`audit ${entry.action} ${entry.entityType} ${entry.entityId}`);
  } catch (error) {
    logError(`auditlogfout ${entry.action}`);
    if (!client) return;
    throw error;
  }
}

export async function listRecentAudit(limit = 40): Promise<AuditRow[]> {
  const organizationId = await defaultOrganizationId();
  const result = await getPool().query<{
    id: string;
    action: string;
    entity_type: string;
    entity_id: string;
    actor: string;
    details_json: Record<string, unknown>;
    created_at: Date;
  }>(
    `SELECT id, action, entity_type, entity_id, actor, details_json, created_at
     FROM audit_logs
     WHERE organization_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [organizationId, Math.min(Math.max(limit, 1), 100)],
  );
  return result.rows.map((row) => ({
    id: row.id,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    actor: row.actor,
    details: row.details_json ?? {},
    createdAt: new Date(row.created_at).toISOString(),
  }));
}
