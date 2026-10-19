import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import express from "express";
import pg from "pg";
import { closePool } from "./pool.js";

function envValue(name: string) {
  if (process.env[name]?.trim()) return process.env[name]!.trim();
  try {
    const raw = readFileSync(path.join(process.cwd(), ".env"), "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const index = trimmed.indexOf("=");
      if (index < 0) continue;
      if (trimmed.slice(0, index) === name) return trimmed.slice(index + 1).trim();
    }
  } catch {
    // geen lokaal env-bestand
  }
  return "";
}

function hostUrl(database: string) {
  const user = envValue("POSTGRES_USER") || "tzg";
  const password = envValue("POSTGRES_PASSWORD");
  if (!password || password === "change-me") {
    throw new Error("POSTGRES_PASSWORD ontbreekt voor de database-test.");
  }
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@127.0.0.1:5432/${database}`;
}

test("postgres dashboards, schermen, tokens, import en legacy-data", async (t) => {
  const admin = new pg.Client({ connectionString: hostUrl("postgres") });
  await admin.connect();
  const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", ["tzg_test"]);
  if (exists.rowCount === 0) await admin.query("CREATE DATABASE tzg_test");
  await admin.end();

  process.env.DATABASE_URL = hostUrl("tzg_test");
  process.env.DASHBOARD_REPOSITORY = "postgres";
  await closePool();

  const { migrateDatabase } = await import("./migrate.js");
  const { getPool } = await import("./pool.js");
  const { clearOrganizationCache } = await import("./organization.js");
  const { PostgresDashboardRepository } = await import("../dashboards/postgresRepository.js");
  const { PostgresScreenRepository, recordHeartbeat } = await import("../screens/repository.js");
  const { hashScreenToken } = await import("../screens/token.js");
  const { importDashboardsFromJson } = await import("./importJson.js");
  const { listRecentAudit } = await import("../audit/repository.js");
  const { playerRouter } = await import("../routes/player.js");
  const { createDefaultDashboards } = await import("../dashboards/seed.js");

  await migrateDatabase();
  clearOrganizationCache();
  await getPool().query(
    "TRUNCATE audit_logs, screen_heartbeats, screen_tokens, screens, dashboard_widgets, dashboards RESTART IDENTITY CASCADE",
  );

  const dashboards = new PostgresDashboardRepository();
  const screens = new PostgresScreenRepository();
  const temp = mkdtempSync(path.join(tmpdir(), "tzg-import-"));
  const previousData = process.env.DATA_DIR;
  process.env.DATA_DIR = temp;
  const source = path.join(temp, "dashboards.json");
  writeFileSync(
    source,
    `${JSON.stringify({ version: 1, dashboards: createDefaultDashboards("2026-01-01T00:00:00.000Z") }, null, 2)}\n`,
  );

  try {
    const dry = await importDashboardsFromJson({ dryRun: true, force: false });
    assert.equal(dry.backup, null);
    assert.deepEqual(dry.inserted.sort(), ["ict", "planning"]);
    assert.equal((await dashboards.getAll()).length, 0);

    const imported = await importDashboardsFromJson({ dryRun: false, force: false });
    assert.ok(imported.backup);
    assert.equal((await dashboards.getAll()).length, 2);
    const planning = await dashboards.getBySlug("planning");
    const ict = await dashboards.getBySlug("ict");
    assert.ok(planning);
    assert.ok(ict);
    assert.ok(planning!.widgets.some((widget) => widget.type === "waterlevels"));
    assert.ok(ict!.widgets.some((widget) => widget.type === "prtg"));

    const again = await importDashboardsFromJson({ dryRun: false, force: false });
    assert.deepEqual(again.skipped.sort(), ["ict", "planning"]);
    assert.equal(again.inserted.length, 0);
    assert.equal((await dashboards.getAll()).length, 2);

    await assert.rejects(
      () => dashboards.create({ name: "Nog een", slug: "planning" }, { actor: "test" }),
      /Slug bestaat al/,
    );

    const created = await dashboards.create(
      { name: "Tijdelijk", slug: "tijdelijk", widgets: [] },
      { actor: "test" },
    );
    await dashboards.update(created.id, { name: "Tijdelijk 2" }, { actor: "test" });
    assert.equal(await dashboards.delete(created.id, { actor: "test" }), true);

    const screen = await screens.create(
      { name: "Testscherm", slug: "testscherm", location: "Test", enabled: true, dashboardId: null },
      "test",
    );
    assert.equal(screen.status, "Nooit verbonden");

    const issued = await screens.issueToken(screen.id, "test");
    assert.ok(issued);
    const stored = await getPool().query<{ token_hash: string }>(
      "SELECT token_hash FROM screen_tokens WHERE id = $1",
      [issued!.tokenId],
    );
    assert.equal(stored.rows[0]?.token_hash, hashScreenToken(issued!.token));
    assert.equal(stored.rows[0]?.token_hash.includes(issued!.token), false);
    const rawInTable = await getPool().query("SELECT count(*)::int AS n FROM screen_tokens WHERE token_hash = $1", [
      issued!.token,
    ]);
    assert.equal(rawInTable.rows[0]?.n, 0);

    const app = express();
    app.use(express.json());
    app.use("/api/player", playerRouter);
    const server = createServer(app);
    await listen(server);
    const base = addressOf(server);
    t.after(async () => {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    });

    const missing = await fetch(`${base}/api/player/config`, {
      headers: { authorization: "Bearer tzg_onbekendtokenonbekendtokenonbekend" },
    });
    assert.equal(missing.status, 401);

    const config = await fetch(`${base}/api/player/config`, {
      headers: { authorization: `Bearer ${issued!.token}` },
    });
    assert.equal(config.status, 200);
    const body = (await config.json()) as { message?: string; dashboard: unknown };
    assert.match(body.message ?? "", /nog niet gekoppeld/);
    assert.equal(body.dashboard, null);

    await screens.update(screen.id, { dashboardId: planning!.id }, "test");
    const linked = await fetch(`${base}/api/player/config`, {
      headers: { authorization: `Bearer ${issued!.token}` },
    });
    assert.equal(linked.status, 200);
    const linkedBody = (await linked.json()) as { dashboard: { slug: string } | null };
    assert.equal(linkedBody.dashboard?.slug, "planning");

    const beat = await fetch(`${base}/api/player/heartbeat`, {
      method: "POST",
      headers: { authorization: `Bearer ${issued!.token}`, "content-type": "application/json" },
      body: JSON.stringify({ appVersion: "test", status: "ok", metadata: { player: "test", token: "mag-niet" } }),
    });
    assert.equal(beat.status, 200);
    const seen = await screens.getById(screen.id);
    assert.equal(seen?.status, "Online");
    const meta = await getPool().query<{ metadata_json: { token?: string; player?: string } }>(
      "SELECT metadata_json FROM screen_heartbeats WHERE screen_id = $1",
      [screen.id],
    );
    assert.equal(meta.rows[0]?.metadata_json.player, "test");
    assert.equal(meta.rows[0]?.metadata_json.token, undefined);

    await getPool().query("UPDATE screens SET last_seen_at = now() - interval '1 hour' WHERE id = $1", [screen.id]);
    const stale = await screens.getById(screen.id);
    assert.equal(stale?.status, "Offline");
    await recordHeartbeat(screen.id, { appVersion: "test", status: "ok", metadata: { player: "test" } });
    assert.equal((await screens.getById(screen.id))?.status, "Online");

    await screens.revokeTokens(screen.id, "test");
    const revoked = await fetch(`${base}/api/player/config`, {
      headers: { authorization: `Bearer ${issued!.token}` },
    });
    assert.equal(revoked.status, 401);

    const replacement = await screens.issueToken(screen.id, "test");
    assert.ok(replacement);
    await screens.update(screen.id, { enabled: false }, "test");
    const disabled = await fetch(`${base}/api/player/config`, {
      headers: { authorization: `Bearer ${replacement!.token}` },
    });
    assert.equal(disabled.status, 403);
    assert.equal((await screens.getById(screen.id))?.status, "Uitgeschakeld");

    const audit = await listRecentAudit(20);
    const actions = new Set(audit.map((entry) => entry.action));
    for (const required of [
      "dashboard.created",
      "screen.created",
      "screen.dashboard_assigned",
      "token.created",
      "token.revoked",
    ]) {
      assert.equal(actions.has(required), true, required);
    }
    assert.equal(JSON.stringify(audit).includes(issued!.token), false);
  } finally {
    if (previousData === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previousData;
    rmSync(temp, { recursive: true, force: true });
    await closePool();
  }
});

function listen(server: Server) {
  return new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
}

function addressOf(server: Server) {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("geen poort");
  return `http://127.0.0.1:${address.port}`;
}
