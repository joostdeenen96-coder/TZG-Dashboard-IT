import assert from "node:assert/strict";
import express from "express";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { JsonDashboardRepository, setDashboardRepositoryForTests } from "../dashboards/repository.js";
import { createSession } from "../services/adminSession.js";
import { getHealth } from "../services/healthService.js";
import { dashboardsRouter } from "./dashboards.js";

let server: Server;
let baseUrl = "";
let tempDir = "";
let adminToken = "";

before(async () => {
  tempDir = mkdtempSync(path.join(tmpdir(), "tzg-api-dashboards-"));
  process.env.DATA_DIR = tempDir;
  setDashboardRepositoryForTests(new JsonDashboardRepository());
  adminToken = createSession();

  const app = express();
  app.use(express.json());
  app.use("/api/dashboards", dashboardsRouter);
  app.get("/api/health", async (_req, res) => {
    res.json(await getHealth());
  });

  server = createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("geen poort");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  setDashboardRepositoryForTests(null);
  rmSync(tempDir, { recursive: true, force: true });
});

test("GET /api/dashboards geeft planning en ict", async () => {
  const response = await fetch(`${baseUrl}/api/dashboards`);
  assert.equal(response.status, 200);
  const body = (await response.json()) as { dashboards: Array<{ slug: string }> };
  assert.ok(body.dashboards.some((item) => item.slug === "planning"));
  assert.ok(body.dashboards.some((item) => item.slug === "ict"));
});

test("GET /api/dashboards/by-slug/planning geeft definitie", async () => {
  const response = await fetch(`${baseUrl}/api/dashboards/by-slug/planning`);
  assert.equal(response.status, 200);
  const body = (await response.json()) as { slug: string; widgets: unknown[] };
  assert.equal(body.slug, "planning");
  assert.ok(Array.isArray(body.widgets));
});

test("GET /api/dashboards/by-slug/onbekend geeft 404", async () => {
  const response = await fetch(`${baseUrl}/api/dashboards/by-slug/bestaat-niet`);
  assert.equal(response.status, 404);
  const body = (await response.json()) as { error: string };
  assert.equal(typeof body.error, "string");
  assert.equal(JSON.stringify(body).includes("stack"), false);
});

test("POST /api/dashboards zonder auth geeft 401", async () => {
  const response = await fetch(`${baseUrl}/api/dashboards`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "X", slug: "x" }),
  });
  assert.equal(response.status, 401);
});

test("POST /api/dashboards weigert dubbele slug", async () => {
  const response = await fetch(`${baseUrl}/api/dashboards`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ name: "Planning 2", slug: "planning" }),
  });
  assert.equal(response.status, 400);
  const body = (await response.json()) as { error: string };
  assert.match(body.error, /Slug/);
});

test("POST /api/dashboards weigert ongeldige body", async () => {
  const response = await fetch(`${baseUrl}/api/dashboards`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ name: "", slug: "!!!" }),
  });
  assert.equal(response.status, 400);
});

test("disabled dashboard blijft via API leesbaar met enabled false", async () => {
  const list = await fetch(`${baseUrl}/api/dashboards`);
  const payload = (await list.json()) as { dashboards: Array<{ id: string; slug: string }> };
  const planning = payload.dashboards.find((item) => item.slug === "planning");
  assert.ok(planning);

  const put = await fetch(`${baseUrl}/api/dashboards/${planning!.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json", authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ enabled: false }),
  });
  assert.equal(put.status, 200);

  const bySlug = await fetch(`${baseUrl}/api/dashboards/by-slug/planning`);
  assert.equal(bySlug.status, 200);
  const body = (await bySlug.json()) as { enabled: boolean };
  assert.equal(body.enabled, false);

  await fetch(`${baseUrl}/api/dashboards/${planning!.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json", authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ enabled: true }),
  });
});

test("GET /api/health bevat dashboardRepository zonder secrets", async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    status: string;
    services: { dashboardRepository: string; api: string };
  };
  assert.ok(body.status === "healthy" || body.status === "degraded");
  assert.equal(body.services.api, "healthy");
  assert.equal(body.services.dashboardRepository, "healthy");
  const serialized = JSON.stringify(body);
  assert.equal(serialized.includes("secret"), false);
  assert.equal(serialized.includes("password"), false);
  assert.equal(serialized.includes("widgets"), false);
});
