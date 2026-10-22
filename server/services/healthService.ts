import { fetchBytes, fetchJson } from "../providers/http.js";
import { backupHealth } from "../backup/backup.js";
import { loadConfig } from "../config.js";
import { databaseUrl, getPool } from "../db/pool.js";
import { migrationStatusNow } from "../db/migrate.js";
import { getDashboardRepository } from "../dashboards/repository.js";
import { getDashboardConfig } from "./dashboardConfig.js";
import { getGraphAccessToken, graphUrl, graphGet } from "./graphClient.js";
import { readAppVersion } from "../appPaths.js";
import { logWarn } from "../log.js";
import { versionInfo } from "../version.js";
import { getIntegrationSettings, sharePointGraphPath } from "./settingsService.js";

export type HealthStatus = "healthy" | "degraded" | "unhealthy" | "disabled" | "stale" | "unavailable";

export type SourceCheck = {
  id: string;
  name: string;
  status: HealthStatus;
  detail: string;
  lastChecked: string;
};

/** Gasoil upstream outages must not mark the whole sources aggregate unhealthy. */
const NON_FATAL_SOURCE_IDS = new Set(["interrijn-cbrb", "statbel-gasoil"]);

const PEGELONLINE = "https://www.pegelonline.wsv.de/webservices/rest-api/v2";
const KAUB = "1d26e504-7f9e-480a-b52c-5932be6549ab";
const RUHRORT = "c0f51e35-d0e8-4318-afaf-c5fcbc29f4c1";
const HVZ_STATION = "https://www.hvz.baden-wuerttemberg.de/js/hvz_peg_stmn.js";

function category(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("timeout") || message.includes("abort")) return "timeout";
  if (message.includes("401") || message.includes("403") || message.includes("auth")) return "auth";
  if (message.includes("http") || /\b[45]\d\d\b/.test(message)) return "http";
  return "niet bereikbaar";
}

async function probe(name: string, id: string, run: () => Promise<string>): Promise<SourceCheck> {
  const lastChecked = new Date().toISOString();
  try {
    const detail = await Promise.race([
      run(),
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error("timeout")), 4_000)),
    ]);
    return { id, name, status: "healthy", detail, lastChecked };
  } catch (error) {
    logWarn(`health source ${id}: ${category(error)}`, { event: "health.source" });
    return { id, name, status: "unhealthy", detail: category(error), lastChecked };
  }
}

function disabled(id: string, name: string, detail: string): SourceCheck {
  return { id, name, status: "disabled", detail, lastChecked: new Date().toISOString() };
}

async function checkPegelonline(uuid: string, label: string, id: string) {
  return probe(label, id, async () => {
    const payload = await fetchJson(`${PEGELONLINE}/stations/${uuid}/W.json?includeCurrentMeasurement=true`);
    if (!payload || typeof payload !== "object") throw new Error("ongeldig antwoord");
    return "bereikbaar";
  });
}

async function checkHvz() {
  return probe("HVZ Maxau", "hvz-maxau", async () => {
    const bytes = await fetchBytes(HVZ_STATION);
    if (bytes.byteLength < 32) throw new Error("leeg antwoord");
    return "bereikbaar";
  });
}

async function checkPrtg(): Promise<SourceCheck> {
  const settings = getIntegrationSettings().prtg;
  if (!settings.baseUrl) return disabled("prtg", "PRTG", "niet geconfigureerd");
  return probe("PRTG", "prtg", async () => {
    await fetchBytes(settings.baseUrl.replace(/\/$/, ""));
    return "bereikbaar";
  });
}

async function checkGraph() {
  const settings = getIntegrationSettings().graph;
  if (!settings.tenantId || !settings.clientId || !settings.clientSecret) {
    return disabled("microsoft-graph", "Microsoft Graph", "niet geconfigureerd");
  }
  return probe("Microsoft Graph", "microsoft-graph", async () => {
    await getGraphAccessToken();
    return "token verkregen";
  });
}

async function checkSharePointDiesel() {
  const settings = getIntegrationSettings().graph;
  if (!settings.tenantId || !settings.clientId || !settings.clientSecret) {
    return disabled("sharepoint-diesel", "SharePoint dieselbron", "Graph niet geconfigureerd");
  }
  return probe("SharePoint dieselbron", "sharepoint-diesel", async () => {
    const config = getDashboardConfig().sharepointDiesel;
    const sitePath = sharePointGraphPath(config.siteUrl);
    const site = (await graphGet(graphUrl(`/sites${sitePath}`))) as { id?: string };
    if (!site?.id) throw new Error("site niet gevonden");
    return "site bereikbaar";
  });
}

async function mapLimit<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>) {
  const results: R[] = [];
  let index = 0;
  async function next() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await worker(items[current]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => next()));
  return results;
}

export async function checkDatabase(): Promise<HealthStatus> {
  if (!databaseUrl()) return "unhealthy";
  try {
    await getPool().query("SELECT 1");
    return "healthy";
  } catch {
    logWarn("health database niet bereikbaar", { event: "health.database" });
    return "unhealthy";
  }
}

export function checkConfiguration(): HealthStatus {
  try {
    loadConfig();
    return "healthy";
  } catch {
    return "unhealthy";
  }
}

export async function getLiveHealth() {
  return {
    status: "healthy" as const,
    version: readAppVersion(),
    live: true,
  };
}

export async function getReadyHealth() {
  const version = readAppVersion();
  const configuration = checkConfiguration();
  const database = await checkDatabase();
  const migrations = await migrationStatusNow().catch(() => ({ pending: ["onbekend"], reachable: false, applied: [] as string[] }));
  const dashboardRepo = await getDashboardRepository()
    .health()
    .catch(() => ({ ok: false }));
  const dashboardStatus: HealthStatus = dashboardRepo.ok ? "healthy" : "unhealthy";
  const migrationsOk = migrations.reachable && migrations.pending.length === 0;
  const ready =
    configuration === "healthy" && database === "healthy" && migrationsOk && dashboardStatus === "healthy";
  return {
    status: ready ? ("healthy" as const) : ("unhealthy" as const),
    version,
    services: {
      configuration,
      database,
      migrations: migrationsOk ? ("healthy" as const) : ("unhealthy" as const),
      dashboardRepository: dashboardStatus,
    },
    pendingMigrations: migrations.pending.length,
  };
}

export async function getHealth() {
  const version = readAppVersion();
  const configuration = checkConfiguration();
  const [database, dashboardRepo] = await Promise.all([
    checkDatabase(),
    getDashboardRepository()
      .health()
      .catch(() => ({ ok: false })),
  ]);
  const dashboardStatus: HealthStatus = dashboardRepo.ok ? "healthy" : "unhealthy";
  let status: HealthStatus = "healthy";
  if (database !== "healthy" || dashboardStatus !== "healthy" || configuration !== "healthy") status = "degraded";
  if (process.env.NODE_ENV === "production" && database !== "healthy") status = "unhealthy";
  return {
    status,
    version,
    services: {
      api: "healthy" as const,
      configuration,
      database,
      dashboardRepository: dashboardStatus,
    },
  };
}

export async function getHealthScreens() {
  const { PostgresScreenRepository } = await import("../screens/repository.js");
  return new PostgresScreenRepository().counts();
}

async function checkGasOilSources(): Promise<SourceCheck[]> {
  const { getGasOilProviderHealth } = await import("../gasoil/gasOilSurchargeService.js");
  const rows = await getGasOilProviderHealth();
  return rows.map((row) => ({
    id: row.id === "interrijnCbrb" ? "interrijn-cbrb" : "statbel-gasoil",
    name: row.name,
    status: row.status,
    detail: row.detail,
    lastChecked: row.lastChecked,
  }));
}

export async function getHealthSources() {
  const jobs = [
    () => checkPegelonline(KAUB, "PEGELONLINE Kaub", "pegelonline-kaub"),
    () => checkPegelonline(RUHRORT, "PEGELONLINE Ruhrort", "pegelonline-ruhrort"),
    () => checkHvz(),
    () => checkPrtg(),
    () => checkGraph(),
    () => checkSharePointDiesel(),
  ];
  const checks = await mapLimit(jobs, 2, (job) => job());
  const gasOil = await checkGasOilSources();
  const all = [...checks, ...gasOil];
  const relevant = all.filter(
    (item) => item.status !== "disabled" && item.status !== "unavailable" && item.status !== "stale" && !NON_FATAL_SOURCE_IDS.has(item.id),
  );
  const unhealthy = relevant.filter((item) => item.status === "unhealthy").length;
  const status: HealthStatus =
    relevant.length === 0 ? "healthy" : unhealthy === 0 ? "healthy" : unhealthy === relevant.length ? "unhealthy" : "degraded";
  return {
    status,
    version: readAppVersion(),
    sources: all,
  };
}

export function getHealthBackups() {
  const backup = backupHealth();
  return {
    lastSuccessAt: backup.lastSuccessAt,
    ageSeconds: backup.ageSeconds,
    size: backup.size,
    status: backup.status,
    retentionDays: backup.retentionDays,
    maxAgeHours: backup.maxAgeHours,
  };
}

export function getVersionPayload() {
  return versionInfo();
}

export async function getDiagnostics() {
  const [ready, sources, screens, health] = await Promise.all([
    getReadyHealth(),
    getHealthSources(),
    getHealthScreens().catch(() => ({ total: 0, active: 0, online: 0, offline: 0, neverConnected: 0, disabled: 0 })),
    getHealth(),
  ]);
  const { recentSafeEvents } = await import("../log.js");
  return {
    version: getVersionPayload(),
    runtime: {
      node: process.version,
      environment: process.env.NODE_ENV || "development",
    },
    health,
    ready,
    backups: getHealthBackups(),
    sources,
    screens,
    events: recentSafeEvents(),
  };
}
