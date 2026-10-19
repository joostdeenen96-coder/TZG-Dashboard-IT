import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { DashboardValidationError } from "./model.js";
import { JsonDashboardRepository } from "./repository.js";

function withTempRepo(run: (repo: JsonDashboardRepository, dir: string) => Promise<void>) {
  return async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "tzg-dashboards-"));
    const previous = process.env.DATA_DIR;
    process.env.DATA_DIR = dir;
    try {
      const repo = new JsonDashboardRepository();
      await run(repo, dir);
    } finally {
      if (previous === undefined) delete process.env.DATA_DIR;
      else process.env.DATA_DIR = previous;
      rmSync(dir, { recursive: true, force: true });
    }
  };
}

test(
  "JsonDashboardRepository seedt planning en ict bij ontbrekend bestand",
  withTempRepo(async (repo, dir) => {
    const all = await repo.getAll();
    assert.equal(all.length, 2);
    assert.ok(all.some((item) => item.slug === "planning"));
    assert.ok(all.some((item) => item.slug === "ict"));
    const raw = readFileSync(path.join(dir, "dashboards.json"), "utf8");
    assert.ok(raw.includes('"planning"'));
  }),
);

test(
  "JsonDashboardRepository schrijft en leest updates atomair",
  withTempRepo(async (repo) => {
    const created = await repo.create({ name: "Extra", slug: "extra", description: "test" });
    const loaded = await repo.getBySlug("extra");
    assert.ok(loaded);
    assert.equal(loaded!.id, created.id);

    const updated = await repo.update(created.id, { name: "Extra 2", enabled: false });
    assert.equal(updated.name, "Extra 2");
    assert.equal(updated.enabled, false);

    const byId = await repo.getById(created.id);
    assert.equal(byId?.name, "Extra 2");
  }),
);

test(
  "JsonDashboardRepository weigert dubbele slug",
  withTempRepo(async (repo) => {
    await assert.rejects(() => repo.create({ name: "X", slug: "planning" }), DashboardValidationError);
  }),
);

test(
  "JsonDashboardRepository blijft draaien bij ongeldig JSON-bestand",
  withTempRepo(async (repo, dir) => {
    writeFileSync(path.join(dir, "dashboards.json"), "{ niet-json", "utf8");
    const all = await repo.getAll();
    assert.equal(all.length, 2);
    assert.ok(all.some((item) => item.slug === "planning"));
  }),
);

test(
  "JsonDashboardRepository health is ok na laden",
  withTempRepo(async (repo) => {
    const health = await repo.health();
    assert.equal(health.ok, true);
    assert.match(health.detail, /dashboards/);
  }),
);

test(
  "disabled dashboard blijft leesbaar via repository",
  withTempRepo(async (repo) => {
    const planning = await repo.getBySlug("planning");
    assert.ok(planning);
    await repo.update(planning!.id, { enabled: false });
    const again = await repo.getBySlug("planning");
    assert.equal(again?.enabled, false);
  }),
);
