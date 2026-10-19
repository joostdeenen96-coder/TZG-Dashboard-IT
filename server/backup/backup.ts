import { spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { appRoot } from "../appPaths.js";
import { appConfig, loadConfig } from "../config.js";
import { logError, logInfo, logWarn } from "../log.js";

export type BackupMeta = {
  file: string;
  createdAt: string;
  size: number;
  format: "custom";
  status: "ok" | "failed" | "incomplete";
};

export function backupDirectory() {
  const configured = process.env.BACKUP_DIRECTORY?.trim();
  if (configured && configured !== "/backups") return configured;
  if (configured === "/backups" && existsSync("/backups")) return "/backups";
  return path.join(appRoot(), "backups");
}

export function parseDatabaseUrl(connectionString: string) {
  let parsed: URL;
  try {
    parsed = new URL(connectionString);
  } catch {
    throw new Error("DATABASE_URL is ongeldig.");
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL is ongeldig.");
  }
  return {
    host: parsed.hostname || "127.0.0.1",
    port: parsed.port || "5432",
    user: decodeURIComponent(parsed.username || "tzg"),
    password: decodeURIComponent(parsed.password || ""),
    database: decodeURIComponent((parsed.pathname || "/tzg").replace(/^\//, "") || "tzg"),
  };
}

function connection() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL ontbreekt.");
  return parseDatabaseUrl(url);
}

function run(command: string, args: string[], options: { env?: NodeJS.ProcessEnv; timeoutMs?: number } = {}) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, {
      env: { ...process.env, ...options.env, PGPASSWORD: options.env?.PGPASSWORD ?? process.env.PGPASSWORD },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${command} timeout`));
    }, options.timeoutMs ?? 120_000);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

function pgEnv() {
  const conn = connection();
  return {
    conn,
    env: {
      ...process.env,
      PGHOST: conn.host,
      PGPORT: conn.port,
      PGUSER: conn.user,
      PGDATABASE: conn.database,
      PGPASSWORD: conn.password,
    },
  };
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function metaPath(file: string) {
  return `${file}.meta.json`;
}

export function listBackups(): BackupMeta[] {
  const dir = backupDirectory();
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir).filter((name) => name.endsWith(".dump") && !name.endsWith(".tmp.dump"));
  const items: BackupMeta[] = [];
  for (const name of files) {
    const file = path.join(dir, name);
    const sidecar = metaPath(file);
    const size = statSync(file).size;
    if (existsSync(sidecar)) {
      try {
        const raw = JSON.parse(readFileSync(sidecar, "utf8")) as BackupMeta;
        items.push({ ...raw, file, size });
        continue;
      } catch {
        // val terug op bestandsstatistiek
      }
    }
    items.push({
      file,
      createdAt: statSync(file).mtime.toISOString(),
      size,
      format: "custom",
      status: size > 0 ? "ok" : "incomplete",
    });
  }
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createBackup() {
  const dir = backupDirectory();
  mkdirSync(dir, { recursive: true, mode: 0o750 });
  const { conn, env } = pgEnv();
  const finalName = path.join(dir, `tzg-${stamp()}.dump`);
  const tempName = `${finalName}.tmp`;
  logInfo("backup starten", { event: "backup.start" });
  const dump = await run("pg_dump", ["-Fc", "-d", conn.database, "-f", tempName], { env, timeoutMs: 180_000 });
  if (dump.code !== 0) {
    if (existsSync(tempName)) unlinkSync(tempName);
    logError("backup mislukt", { event: "backup.failed" });
    throw new Error("Backup mislukt.");
  }
  if (!existsSync(tempName) || statSync(tempName).size <= 0) {
    if (existsSync(tempName)) unlinkSync(tempName);
    throw new Error("Backup is leeg.");
  }
  renameSync(tempName, finalName);
  const meta: BackupMeta = {
    file: finalName,
    createdAt: new Date().toISOString(),
    size: statSync(finalName).size,
    format: "custom",
    status: "ok",
  };
  writeFileSync(metaPath(finalName), JSON.stringify(meta), { mode: 0o600 });
  logInfo("backup klaar", { event: "backup.ok", durationMs: undefined });
  return meta;
}

const REQUIRED_TABLES = [
  "organizations",
  "dashboards",
  "dashboard_widgets",
  "screens",
  "screen_tokens",
  "screen_heartbeats",
  "audit_logs",
];

export async function verifyBackup(file?: string) {
  const target = file || listBackups()[0]?.file;
  if (!target) throw new Error("Geen backup gevonden.");
  if (!existsSync(target)) throw new Error("Backupbestand ontbreekt.");
  const size = statSync(target).size;
  if (size <= 0) throw new Error("Backup is leeg.");
  const listed = await run("pg_restore", ["--list", target], { timeoutMs: 60_000 });
  if (listed.code !== 0) throw new Error("Backupformaat is ongeldig.");
  const missing = REQUIRED_TABLES.filter((table) => !listed.stdout.includes(`TABLE DATA public ${table}`) && !listed.stdout.includes(`TABLE public ${table}`));
  if (missing.length) throw new Error("Backup mist tabellen.");
  logInfo("backup geverifieerd", { event: "backup.verify" });
  return { file: target, size, tables: REQUIRED_TABLES, ok: true };
}

export function cleanupBackups(now = Date.now()) {
  const retention = (() => {
    try {
      return loadConfig().backupRetentionDays;
    } catch {
      return Number(process.env.BACKUP_RETENTION_DAYS || 14);
    }
  })();
  const cutoff = now - retention * 24 * 60 * 60 * 1000;
  let removed = 0;
  for (const item of listBackups()) {
    const created = Date.parse(item.createdAt);
    if (!Number.isFinite(created) || created >= cutoff) continue;
    rmSync(item.file, { force: true });
    rmSync(metaPath(item.file), { force: true });
    removed += 1;
  }
  if (removed) logInfo("backup retentie", { event: "backup.cleanup" });
  return { removed, retentionDays: retention };
}

export async function restoreToDatabase(file: string, database: string) {
  const productionDb = process.env.POSTGRES_DB?.trim() || "tzg";
  if (!database || database === productionDb) {
    throw new Error("Restore-test weigert de productiedatabase.");
  }
  if (!/^tzg_restore[_a-z0-9]+$/.test(database)) {
    throw new Error("Restore-doel is ongeldig.");
  }
  const { conn, env } = pgEnv();
  const created = await run("psql", ["-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", `DROP DATABASE IF EXISTS ${database}; CREATE DATABASE ${database};`], { env });
  if (created.code !== 0) throw new Error("Testdatabase niet aangemaakt.");
  const restored = await run("pg_restore", ["--no-owner", "--no-acl", "-d", database, file], { env: { ...env, PGDATABASE: database } });
  if (restored.code !== 0 && !restored.stderr.includes("errors ignored")) {
    await run("psql", ["-d", "postgres", "-c", `DROP DATABASE IF EXISTS ${database};`], { env }).catch(() => undefined);
    throw new Error("Restore mislukt.");
  }
  const counts = await run(
    "psql",
    [
      "-d",
      database,
      "-tAc",
      "SELECT 'dashboards='||count(*) FROM dashboards; SELECT 'widgets='||count(*) FROM dashboard_widgets; SELECT 'screens='||count(*) FROM screens; SELECT 'tokens_plain='||count(*) FROM screen_tokens WHERE token_hash LIKE 'tzg_%'; SELECT 'planning='||count(*) FROM dashboards WHERE slug='planning'; SELECT 'ict='||count(*) FROM dashboards WHERE slug='ict';",
    ],
    { env: { ...env, PGDATABASE: database } },
  );
  return { database, output: counts.stdout, host: conn.host };
}

export async function dropRestoreDatabase(database: string) {
  const productionDb = process.env.POSTGRES_DB?.trim() || "tzg";
  if (!database || database === productionDb || !database.startsWith("tzg_restore")) {
    throw new Error("Weigert database te verwijderen.");
  }
  const { env } = pgEnv();
  await run("psql", ["-d", "postgres", "-c", `DROP DATABASE IF EXISTS ${database};`], { env });
}

export function backupHealth() {
  const items = listBackups().filter((item) => item.status === "ok" && item.size > 0);
  const latest = items[0];
  let maxAge = 36;
  try {
    maxAge = appConfig().backupMaxAgeHours;
  } catch {
    const raw = Number(process.env.BACKUP_MAX_AGE_HOURS || 36);
    if (Number.isInteger(raw) && raw > 0) maxAge = raw;
  }
  let retention = 14;
  try {
    retention = appConfig().backupRetentionDays;
  } catch {
    retention = Number(process.env.BACKUP_RETENTION_DAYS || 14) || 14;
  }
  if (!latest) {
    return {
      status: "unhealthy" as const,
      lastSuccessAt: null as string | null,
      ageSeconds: null as number | null,
      size: null as number | null,
      retentionDays: retention,
      maxAgeHours: maxAge,
    };
  }
  const ageSeconds = Math.max(0, Math.round((Date.now() - Date.parse(latest.createdAt)) / 1000));
  const stale = ageSeconds > maxAge * 3600;
  return {
    status: stale ? ("degraded" as const) : ("healthy" as const),
    lastSuccessAt: latest.createdAt,
    ageSeconds,
    size: latest.size,
    retentionDays: retention,
    maxAgeHours: maxAge,
  };
}

export function writeStreamSink() {
  return createWriteStream;
}

export function warnMissingDump() {
  logWarn("pg_dump ontbreekt op dit pad", { event: "backup.tool" });
}
