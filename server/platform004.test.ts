import assert from "node:assert/strict";
import { writeFileSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import express from "express";
import { cleanupBackups } from "./backup/backup.js";
import { getLiveHealth } from "./services/healthService.js";
import { rateLimit, resetRateLimit } from "./rateLimit.js";
import { requestIdMiddleware, getRequestId } from "./requestId.js";
import { sanitize } from "./log.js";
import { restoreToDatabase } from "./backup/backup.js";
import { versionInfo } from "./version.js";

test("health live vereist geen database", async () => {
  const live = await getLiveHealth();
  assert.equal(live.status, "healthy");
  assert.equal(live.live, true);
});

test("version endpoint payload bevat geen secrets", () => {
  const info = versionInfo();
  const raw = JSON.stringify(info);
  assert.equal(raw.includes("postgresql://"), false);
  assert.equal(typeof info.version, "string");
  assert.equal(typeof info.environment, "string");
});

test("request-ID wordt gezet", async () => {
  const app = express();
  app.use(requestIdMiddleware);
  app.get("/x", (req, res) => res.json({ id: getRequestId(req) }));
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.on("listening", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const response = await fetch(`http://127.0.0.1:${port}/x`);
  const body = (await response.json()) as { id: string };
  assert.equal(response.headers.get("x-request-id"), body.id);
  assert.match(body.id, /^[0-9a-f-]{8,}/i);
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

test("rate limiting blokkeert na limiet", async () => {
  resetRateLimit();
  const app = express();
  app.use(rateLimit({ name: "test", windowMs: 60_000, max: 2 }));
  app.get("/x", (_req, res) => res.json({ ok: true }));
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.on("listening", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const first = await fetch(`http://127.0.0.1:${port}/x`);
  const second = await fetch(`http://127.0.0.1:${port}/x`);
  const third = await fetch(`http://127.0.0.1:${port}/x`);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(third.status, 429);
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

test("body size limit weigert te grote JSON", async () => {
  const app = express();
  app.use(express.json({ limit: "1kb" }));
  app.post("/x", (_req, res) => res.json({ ok: true }));
  app.use((_error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(413).json({ error: "te groot" });
  });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.on("listening", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const response = await fetch(`http://127.0.0.1:${port}/x`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ data: "x".repeat(4000) }),
  });
  assert.equal(response.status, 413);
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

test("backupretentie verwijdert oude dumps", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "tzg-bak-"));
  const oldFile = path.join(dir, "tzg-old.dump");
  const newFile = path.join(dir, "tzg-new.dump");
  writeFileSync(oldFile, "dump");
  writeFileSync(newFile, "dump");
  const oldTime = new Date(Date.now() - 40 * 24 * 3600 * 1000);
  writeFileSync(`${oldFile}.meta.json`, JSON.stringify({ file: oldFile, createdAt: oldTime.toISOString(), size: 4, format: "custom", status: "ok" }));
  writeFileSync(`${newFile}.meta.json`, JSON.stringify({ file: newFile, createdAt: new Date().toISOString(), size: 4, format: "custom", status: "ok" }));
  process.env.BACKUP_DIRECTORY = dir;
  process.env.BACKUP_RETENTION_DAYS = "14";
  const result = cleanupBackups();
  assert.equal(result.removed >= 1, true);
  rmSync(dir, { recursive: true, force: true });
  delete process.env.BACKUP_DIRECTORY;
});

test("restore-test weigert productiedatabase", async () => {
  process.env.POSTGRES_DB = "tzg";
  await assert.rejects(() => restoreToDatabase("/tmp/none.dump", "tzg"), /productiedatabase|ongeldig/);
});

test("sanitize houdt secrets uit logs", () => {
  const clean = sanitize("cookie=abc Authorization: Bearer tok DATABASE_URL=postgresql://a:b@h/db");
  assert.equal(clean.includes("tok"), false);
  assert.equal(clean.includes("postgresql://a:b"), false);
});
