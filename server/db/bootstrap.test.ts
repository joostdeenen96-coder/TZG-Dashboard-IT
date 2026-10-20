import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import pg from "pg";
import { closePool } from "./pool.js";
import { createDefaultDashboards } from "../dashboards/seed.js";

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

test("production seed scripts gebruiken node dist zonder tsx", () => {
  const pkg = JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };
  assert.equal(pkg.scripts["db:seed:prod"], "node dist/server/scripts/db-seed.js");
  assert.equal(pkg.scripts["db:migrate:prod"], "node dist/server/scripts/db-migrate.js");
  assert.equal(pkg.scripts["db:migrate:status:prod"], "node dist/server/scripts/db-migrate-status.js");
  assert.equal(pkg.scripts["db:import-json:prod"], "node dist/server/scripts/db-import-json.js");
  assert.match(pkg.scripts["db:seed"], /tsx /);
  const source = readFileSync(path.join(process.cwd(), "server/scripts/db-seed.ts"), "utf8");
  assert.equal(source.includes("tsx"), false);
  const entrypoint = readFileSync(path.join(process.cwd(), "docker-entrypoint.sh"), "utf8");
  assert.match(entrypoint, /node \/app\/dist\/server\/scripts\/db-migrate\.js/);
  assert.match(entrypoint, /node \/app\/dist\/server\/scripts\/db-seed\.js/);
  assert.equal(entrypoint.includes("tsx"), false);
});

test("lege PostgreSQL krijgt Teunesen, Planning en ICT zonder overwrite", async () => {
  const admin = new pg.Client({ connectionString: hostUrl("postgres") });
  await admin.connect();
  await admin.query("DROP DATABASE IF EXISTS tzg_seed_test WITH (FORCE)");
  await admin.query("CREATE DATABASE tzg_seed_test");
  await admin.end();

  const previousUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = hostUrl("tzg_seed_test");
  process.env.DASHBOARD_REPOSITORY = "postgres";
  await closePool();

  const { migrateDatabase } = await import("./migrate.js");
  const { getPool } = await import("./pool.js");
  const { clearOrganizationCache } = await import("./organization.js");
  const { seedDefaultDashboards } = await import("./bootstrap.js");
  const { PostgresDashboardRepository } = await import("../dashboards/postgresRepository.js");
  const { DEFAULT_ORG_SLUG } = await import("./organization.js");

  const logs: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
    originalLog.apply(console, args);
  };
  console.error = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
    originalError.apply(console, args);
  };

  try {
    await migrateDatabase();
    await getPool().query("TRUNCATE organizations CASCADE");
    clearOrganizationCache();
    const expected = createDefaultDashboards();
    const planningSeed = expected.find((item) => item.slug === "planning");
    const ictSeed = expected.find((item) => item.slug === "ict");
    assert.ok(planningSeed);
    assert.ok(ictSeed);
    assert.equal(planningSeed.widgets.length, 6);
    assert.equal(ictSeed.widgets.length, 5);

    const first = await seedDefaultDashboards();
    assert.equal(first.organization, "created");
    assert.deepEqual([...first.created].sort(), ["ict", "planning"]);
    assert.equal(first.skipped.length, 0);

    const org = await getPool().query("SELECT slug, name FROM organizations WHERE slug = $1", [DEFAULT_ORG_SLUG]);
    assert.equal(org.rows[0]?.name, "Teunesen");

    const repo = new PostgresDashboardRepository();
    const planning = await repo.getBySlug("planning");
    const ict = await repo.getBySlug("ict");
    assert.equal(planning?.name, "Planning");
    assert.equal(ict?.name, "ICT");
    assert.equal(planning?.widgets.length, planningSeed.widgets.length);
    assert.equal(ict?.widgets.length, ictSeed.widgets.length);
    assert.deepEqual(
      planning?.widgets.map((widget) => widget.type).sort(),
      planningSeed.widgets.map((widget) => widget.type).sort(),
    );

    const second = await seedDefaultDashboards();
    assert.equal(second.organization, "existing");
    assert.equal(second.created.length, 0);
    assert.deepEqual([...second.skipped].sort(), ["ict", "planning"]);
    assert.equal((await repo.getAll()).length, 2);

    await repo.update(planning!.id, { name: "Planning beheer", widgets: planning!.widgets.slice(0, 1) });
    await repo.update(ict!.id, { name: "ICT beheer" });
    const third = await seedDefaultDashboards();
    assert.equal(third.created.length, 0);
    const planningAfter = await repo.getBySlug("planning");
    const ictAfter = await repo.getBySlug("ict");
    assert.equal(planningAfter?.name, "Planning beheer");
    assert.equal(planningAfter?.widgets.length, 1);
    assert.equal(ictAfter?.name, "ICT beheer");
    assert.equal(ictAfter?.widgets.length, ictSeed.widgets.length);

    const joined = logs.join("\n");
    const password = envValue("POSTGRES_PASSWORD");
    assert.equal(joined.includes(password), false);
    assert.equal(joined.includes("postgresql://"), false);
    assert.equal(/tzg_[A-Za-z0-9_-]{8,}/.test(joined), false);
  } finally {
    console.log = originalLog;
    console.error = originalError;
    await closePool();
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
    const drop = new pg.Client({ connectionString: hostUrl("postgres") });
    await drop.connect();
    await drop.query("DROP DATABASE IF EXISTS tzg_seed_test WITH (FORCE)");
    await drop.end();
  }
});

test("seed faalt gecontroleerd bij databasefout", async () => {
  const previousUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = "postgresql://tzg:ongeldig@127.0.0.1:1/tzg_seed_missing";
  await closePool();
  const { seedDefaultDashboards } = await import("./bootstrap.js");
  await assert.rejects(() => seedDefaultDashboards());
  await closePool();
  if (previousUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = previousUrl;
});
