import pg from "pg";
import { logError } from "../log.js";

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function databaseUrl() {
  return process.env.DATABASE_URL?.trim() ?? "";
}

export function getPool() {
  const connectionString = databaseUrl();
  if (!connectionString) throw new Error("DATABASE_URL ontbreekt.");
  if (!pool) {
    pool = new Pool({
      connectionString,
      max: 10,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
    });
    pool.on("error", () => {
      logError("database pool fout", { event: "database.pool" });
      const current = pool;
      pool = null;
      void current?.end().catch(() => undefined);
    });
  }
  return pool;
}

export async function closePool() {
  if (!pool) return;
  const current = pool;
  pool = null;
  await current.end();
}
