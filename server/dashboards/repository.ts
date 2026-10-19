import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { dataDir } from "../appPaths.js";
import { logError, logInfo, logWarn } from "../log.js";
import {
  DashboardValidationError,
  parseDashboardCreateInput,
  parseDashboardDefinition,
  parseDashboardStore,
  parseDashboardUpdateInput,
  type DashboardDefinition,
  type DashboardStoreFile,
} from "./model.js";
import { createDefaultDashboards } from "./seed.js";

export interface DashboardRepository {
  getAll(): Promise<DashboardDefinition[]>;
  getById(id: string): Promise<DashboardDefinition | null>;
  getBySlug(slug: string): Promise<DashboardDefinition | null>;
  create(input: unknown): Promise<DashboardDefinition>;
  update(id: string, input: unknown): Promise<DashboardDefinition>;
  delete(id: string): Promise<boolean>;
  health(): Promise<{ ok: boolean; detail: string }>;
}

function dashboardsFilePath() {
  return path.join(dataDir(), "dashboards.json");
}

function emptyStore(): DashboardStoreFile {
  return { version: 1, dashboards: createDefaultDashboards() };
}

function atomicWriteJson(file: string, value: unknown) {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, file);
}

export class JsonDashboardRepository implements DashboardRepository {
  private load(): DashboardStoreFile {
    const file = dashboardsFilePath();
    try {
      const raw = readFileSync(file, "utf8");
      return parseDashboardStore(JSON.parse(raw));
    } catch (error) {
      const missing = error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";
      if (!missing && !(error instanceof SyntaxError) && !(error instanceof DashboardValidationError)) {
        logError(`dashboards.json lezen mislukt (${error instanceof Error ? error.message : "onbekend"}).`);
      } else if (!missing) {
        logWarn(
          `dashboards.json ongeldig (${error instanceof Error ? error.message : "onbekend"}). Standaarddashboards worden gebruikt.`,
        );
      } else {
        logInfo("dashboards.json ontbreekt. Standaarddashboards planning/ict worden aangemaakt.");
      }
      const store = emptyStore();
      try {
        atomicWriteJson(file, store);
      } catch (writeError) {
        logError(`dashboards.json schrijven mislukt (${writeError instanceof Error ? writeError.message : "onbekend"}).`);
      }
      return store;
    }
  }

  private save(store: DashboardStoreFile) {
    parseDashboardStore(store);
    atomicWriteJson(dashboardsFilePath(), store);
  }

  async getAll() {
    return this.load().dashboards.slice();
  }

  async getById(id: string) {
    return this.load().dashboards.find((item) => item.id === id) ?? null;
  }

  async getBySlug(slug: string) {
    const normalized = slug.trim().toLowerCase();
    return this.load().dashboards.find((item) => item.slug === normalized) ?? null;
  }

  async create(input: unknown) {
    const body = parseDashboardCreateInput(input);
    const store = this.load();
    if (store.dashboards.some((item) => item.slug === body.slug)) {
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
    store.dashboards.push(dashboard);
    this.save(store);
    logInfo(`dashboard aangemaakt ${dashboard.slug}`);
    return dashboard;
  }

  async update(id: string, input: unknown) {
    const body = parseDashboardUpdateInput(input);
    const store = this.load();
    const index = store.dashboards.findIndex((item) => item.id === id);
    if (index < 0) throw new DashboardValidationError("Dashboard niet gevonden.");
    const current = store.dashboards[index]!;
    if (body.slug && body.slug !== current.slug && store.dashboards.some((item) => item.slug === body.slug)) {
      throw new DashboardValidationError(`Slug bestaat al: ${body.slug}.`);
    }
    const next = parseDashboardDefinition({
      ...current,
      ...body,
      theme: body.theme ? { ...current.theme, ...body.theme } : current.theme,
      layout: body.layout ? { ...current.layout, ...body.layout } : current.layout,
      widgets: body.widgets ?? current.widgets,
      updatedAt: new Date().toISOString(),
    });
    store.dashboards[index] = next;
    this.save(store);
    logInfo(`dashboard bijgewerkt ${next.slug}`);
    return next;
  }

  async delete(id: string) {
    const store = this.load();
    const next = store.dashboards.filter((item) => item.id !== id);
    if (next.length === store.dashboards.length) return false;
    store.dashboards = next;
    this.save(store);
    logInfo(`dashboard verwijderd ${id}`);
    return true;
  }

  async health() {
    try {
      const all = await this.getAll();
      return { ok: true, detail: `${all.length} dashboards geladen` };
    } catch (error) {
      return { ok: false, detail: error instanceof Error ? error.message : "onleesbaar" };
    }
  }
}

let repository: DashboardRepository | null = null;

export function getDashboardRepository() {
  if (!repository) repository = new JsonDashboardRepository();
  return repository;
}

/** Alleen voor tests. */
export function setDashboardRepositoryForTests(next: DashboardRepository | null) {
  repository = next;
}
