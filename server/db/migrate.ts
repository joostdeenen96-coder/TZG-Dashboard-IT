import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { appRoot } from "../appPaths.js";
import { logInfo, logWarn } from "../log.js";
import { closePool, getPool } from "./pool.js";

export function migrationsDir() {
  const candidates = [
    path.join(appRoot(), "server", "db", "migrations"),
    path.join(appRoot(), "dist", "server", "db", "migrations"),
  ];
  for (const dir of candidates) {
    try {
      readdirSync(dir);
      return dir;
    } catch {
      // volgende kandidaat
    }
  }
  throw new Error("Migratiemap ontbreekt.");
}

export function listMigrationFiles() {
  return readdirSync(migrationsDir())
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

async function waitForDatabase() {
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    try {
      await getPool().query("SELECT 1");
      return;
    } catch (error) {
      const raw = error && typeof error === "object" && "code" in error ? String(error.code) : "";
      const code = /^[A-Za-z0-9_]{1,16}$/.test(raw) ? raw : "onbekend";
      logWarn(`database nog niet bereikbaar (poging ${attempt}, code ${code})`);
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }
  throw new Error("Database niet bereikbaar.");
}

export async function appliedMigrationIds() {
  await waitForDatabase();
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  const result = await getPool().query<{ id: string }>("SELECT id FROM schema_migrations ORDER BY id");
  return result.rows.map((row) => row.id);
}

export async function migrateDatabase() {
  const applied = new Set(await appliedMigrationIds());
  const files = listMigrationFiles();
  const ran: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(path.join(migrationsDir(), file), "utf8");
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (id) VALUES ($1)", [file]);
      await client.query("COMMIT");
      ran.push(file);
      logInfo(`migratie toegepast ${file}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  return { applied: [...applied], ran };
}

export async function migrationStatus() {
  const applied = await appliedMigrationIds();
  const files = listMigrationFiles();
  const appliedSet = new Set(applied);
  return {
    applied,
    pending: files.filter((file) => !appliedSet.has(file)),
  };
}

export async function migrationStatusNow() {
  const files = listMigrationFiles();
  try {
    const result = await getPool().query<{ id: string }>("SELECT id FROM schema_migrations ORDER BY id");
    const applied = result.rows.map((row) => row.id);
    const appliedSet = new Set(applied);
    return {
      applied,
      pending: files.filter((file) => !appliedSet.has(file)),
      reachable: true,
    };
  } catch {
    return { applied: [] as string[], pending: files, reachable: false };
  }
}

export async function runMigrateCli() {
  try {
    const result = await migrateDatabase();
    logInfo(`migratie klaar toegepast=${result.ran.length}`);
    return result;
  } finally {
    await closePool();
  }
}
