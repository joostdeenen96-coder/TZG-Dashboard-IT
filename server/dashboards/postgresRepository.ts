import { randomUUID } from "node:crypto";
import type pg from "pg";
import { writeAudit } from "../audit/repository.js";
import { getPool } from "../db/pool.js";
import { defaultOrganizationId } from "../db/organization.js";
import { logInfo } from "../log.js";
import type { DashboardRepository, RepositoryContext } from "./contract.js";
import {
  DashboardValidationError,
  parseDashboardCreateInput,
  parseDashboardDefinition,
  parseDashboardUpdateInput,
  type DashboardDefinition,
  type DashboardWidget,
} from "./model.js";

type DashRow = {
  id: string;
  name: string;
  slug: string;
  description: string;
  enabled: boolean;
  theme_json: unknown;
  layout_json: unknown;
  created_at: Date;
  updated_at: Date;
};

type WidgetRow = {
  id: string;
  dashboard_id: string;
  type: string;
  title: string;
  enabled: boolean;
  position: number;
  layout_json: Record<string, unknown> | null;
  data_source_json: unknown;
  settings_json: unknown;
  refresh_interval_seconds: number;
};

function actorOf(context?: RepositoryContext) {
  return context?.actor?.trim() || "system";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function widgetId(id: string) {
  return isUuid(id) ? id : randomUUID();
}

function toDefinition(row: DashRow, widgets: WidgetRow[]): DashboardDefinition {
  return parseDashboardDefinition({
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description ?? "",
    enabled: row.enabled,
    theme: row.theme_json,
    layout: row.layout_json,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    widgets: widgets.map((widget) => {
      const layout = widget.layout_json ?? {};
      return {
        id: widget.id,
        type: widget.type,
        title: widget.title,
        enabled: widget.enabled,
        position: {
          order: widget.position,
          ...(typeof layout.row === "number" ? { row: layout.row } : {}),
          ...(typeof layout.column === "number" ? { column: layout.column } : {}),
          ...(typeof layout.span === "number" ? { span: layout.span } : {}),
        },
        layout: { area: layout.area, width: layout.width },
        dataSource: widget.data_source_json,
        settings: widget.settings_json ?? {},
        refreshIntervalSeconds: widget.refresh_interval_seconds,
      };
    }),
  });
}

async function loadWidgets(client: pg.Pool | pg.PoolClient, ids: string[]) {
  if (ids.length === 0) return new Map<string, WidgetRow[]>();
  const result = await client.query<WidgetRow>(
    `SELECT id, dashboard_id, type, title, enabled, position, layout_json, data_source_json, settings_json, refresh_interval_seconds
     FROM dashboard_widgets
     WHERE dashboard_id = ANY($1::uuid[])
     ORDER BY position ASC, title ASC`,
    [ids],
  );
  const grouped = new Map<string, WidgetRow[]>();
  for (const row of result.rows) {
    const list = grouped.get(row.dashboard_id) ?? [];
    list.push(row);
    grouped.set(row.dashboard_id, list);
  }
  return grouped;
}

async function insertWidgets(client: pg.PoolClient, dashboardId: string, widgets: DashboardWidget[]) {
  for (const widget of widgets) {
    const layout = {
      area: widget.layout.area,
      width: widget.layout.width,
      row: widget.position.row,
      column: widget.position.column,
      span: widget.position.span,
    };
    await client.query(
      `INSERT INTO dashboard_widgets (
         id, dashboard_id, type, title, enabled, position, layout_json, data_source_json, settings_json, refresh_interval_seconds
       ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10)`,
      [
        widgetId(widget.id),
        dashboardId,
        widget.type,
        widget.title,
        widget.enabled,
        widget.position.order,
        JSON.stringify(layout),
        JSON.stringify(widget.dataSource),
        JSON.stringify(widget.settings ?? {}),
        widget.refreshIntervalSeconds,
      ],
    );
  }
}

function duplicateSlug(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

export class PostgresDashboardRepository implements DashboardRepository {
  async getAll() {
    const organizationId = await defaultOrganizationId();
    const result = await getPool().query<DashRow>(
      `SELECT id, name, slug, description, enabled, theme_json, layout_json, created_at, updated_at
       FROM dashboards WHERE organization_id = $1 ORDER BY name ASC`,
      [organizationId],
    );
    const widgets = await loadWidgets(
      getPool(),
      result.rows.map((row) => row.id),
    );
    return result.rows.map((row) => toDefinition(row, widgets.get(row.id) ?? []));
  }

  async getById(id: string) {
    if (!isUuid(id)) return null;
    const organizationId = await defaultOrganizationId();
    const result = await getPool().query<DashRow>(
      `SELECT id, name, slug, description, enabled, theme_json, layout_json, created_at, updated_at
       FROM dashboards WHERE organization_id = $1 AND id = $2`,
      [organizationId, id],
    );
    const row = result.rows[0];
    if (!row) return null;
    const widgets = await loadWidgets(getPool(), [row.id]);
    return toDefinition(row, widgets.get(row.id) ?? []);
  }

  async getBySlug(slug: string) {
    const organizationId = await defaultOrganizationId();
    const result = await getPool().query<DashRow>(
      `SELECT id, name, slug, description, enabled, theme_json, layout_json, created_at, updated_at
       FROM dashboards WHERE organization_id = $1 AND slug = $2`,
      [organizationId, slug.trim().toLowerCase()],
    );
    const row = result.rows[0];
    if (!row) return null;
    const widgets = await loadWidgets(getPool(), [row.id]);
    return toDefinition(row, widgets.get(row.id) ?? []);
  }

  async create(input: unknown, context?: RepositoryContext) {
    const body = parseDashboardCreateInput(input);
    const organizationId = await defaultOrganizationId();
    if (await this.getBySlug(body.slug)) {
      throw new DashboardValidationError(`Slug bestaat al: ${body.slug}.`);
    }
    const now = new Date().toISOString();
    const dashboard = parseDashboardDefinition({
      id: randomUUID(),
      name: body.name,
      slug: body.slug,
      description: body.description ?? "",
      enabled: body.enabled ?? true,
      theme: { mode: "dark", glass: true, ...body.theme },
      layout: { preset: "stack", stageWidth: 2560, stageHeight: 1440, ...body.layout },
      widgets: body.widgets ?? [],
      createdAt: now,
      updatedAt: now,
    });
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO dashboards (id, organization_id, name, slug, description, enabled, theme_json, layout_json, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10)`,
        [
          dashboard.id,
          organizationId,
          dashboard.name,
          dashboard.slug,
          dashboard.description,
          dashboard.enabled,
          JSON.stringify(dashboard.theme),
          JSON.stringify(dashboard.layout),
          dashboard.createdAt,
          dashboard.updatedAt,
        ],
      );
      await insertWidgets(client, dashboard.id, dashboard.widgets);
      await writeAudit(
        {
          action: "dashboard.created",
          entityType: "dashboard",
          entityId: dashboard.id,
          actor: actorOf(context),
          details: { slug: dashboard.slug, name: dashboard.name },
        },
        client,
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      if (duplicateSlug(error)) throw new DashboardValidationError(`Slug bestaat al: ${body.slug}.`);
      throw error;
    } finally {
      client.release();
    }
    logInfo(`dashboard aangemaakt ${dashboard.slug}`);
    return (await this.getById(dashboard.id)) ?? dashboard;
  }

  async update(id: string, input: unknown, context?: RepositoryContext) {
    const current = await this.getById(id);
    if (!current) throw new DashboardValidationError("Dashboard niet gevonden.");
    const body = parseDashboardUpdateInput(input);
    if (body.slug && body.slug !== current.slug) {
      const clash = await this.getBySlug(body.slug);
      if (clash && clash.id !== current.id) throw new DashboardValidationError(`Slug bestaat al: ${body.slug}.`);
    }
    const next = parseDashboardDefinition({
      ...current,
      ...body,
      theme: body.theme ? { ...current.theme, ...body.theme } : current.theme,
      layout: body.layout ? { ...current.layout, ...body.layout } : current.layout,
      widgets: body.widgets ?? current.widgets,
      updatedAt: new Date().toISOString(),
    });
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE dashboards
         SET name = $2, slug = $3, description = $4, enabled = $5, theme_json = $6::jsonb, layout_json = $7::jsonb, updated_at = $8
         WHERE id = $1`,
        [
          current.id,
          next.name,
          next.slug,
          next.description,
          next.enabled,
          JSON.stringify(next.theme),
          JSON.stringify(next.layout),
          next.updatedAt,
        ],
      );
      await client.query("DELETE FROM dashboard_widgets WHERE dashboard_id = $1", [current.id]);
      await insertWidgets(client, current.id, next.widgets);
      const assigned = body.widgets === undefined && body.slug === undefined && body.name === undefined;
      await writeAudit(
        {
          action: "dashboard.updated",
          entityType: "dashboard",
          entityId: current.id,
          actor: actorOf(context),
          details: { slug: next.slug, enabled: next.enabled, widgets: assigned ? undefined : next.widgets.length },
        },
        client,
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      if (duplicateSlug(error)) throw new DashboardValidationError(`Slug bestaat al: ${next.slug}.`);
      throw error;
    } finally {
      client.release();
    }
    logInfo(`dashboard bijgewerkt ${next.slug}`);
    return (await this.getById(current.id)) ?? next;
  }

  async delete(id: string, context?: RepositoryContext) {
    const current = await this.getById(id);
    if (!current) return false;
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM dashboards WHERE id = $1", [current.id]);
      await writeAudit(
        {
          action: "dashboard.deleted",
          entityType: "dashboard",
          entityId: current.id,
          actor: actorOf(context),
          details: { slug: current.slug },
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
    logInfo(`dashboard verwijderd ${current.slug}`);
    return true;
  }

  async health() {
    try {
      const all = await this.getAll();
      return { ok: true, detail: `${all.length} dashboards` };
    } catch {
      return { ok: false, detail: "niet leesbaar" };
    }
  }
}
