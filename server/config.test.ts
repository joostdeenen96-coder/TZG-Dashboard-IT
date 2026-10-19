import assert from "node:assert/strict";
import test from "node:test";
import { ConfigError, loadConfig } from "./config.js";

function base(overrides: Record<string, string> = {}) {
  return {
    NODE_ENV: "production",
    PORT: "8080",
    DATABASE_URL: "postgresql://tzg:niet-een-placeholder@postgres:5432/tzg",
    POSTGRES_DB: "tzg",
    POSTGRES_USER: "tzg",
    POSTGRES_PASSWORD: "niet-een-placeholder",
    SCREEN_HEARTBEAT_SECONDS: "60",
    SCREEN_OFFLINE_AFTER_SECONDS: "180",
    BACKUP_RETENTION_DAYS: "14",
    BACKUP_SCHEDULE: "0 2 * * *",
    LOG_LEVEL: "info",
    ...overrides,
  };
}

test("geldige productieconfiguratie wordt geaccepteerd", () => {
  const config = loadConfig(base());
  assert.equal(config.production, true);
  assert.equal(config.port, 8080);
  assert.equal(config.graphEnabled, false);
  assert.equal(config.backupRetentionDays, 14);
});

test("ontbrekende variabele stopt productieconfiguratie", () => {
  const env = base();
  env.POSTGRES_PASSWORD = "";
  assert.throws(() => loadConfig(env), /POSTGRES_PASSWORD/);
});

test("ongeldige poort wordt geweigerd", () => {
  assert.throws(() => loadConfig(base({ PORT: "0" })), /PORT/);
  assert.throws(() => loadConfig(base({ PORT: "abc" })), /PORT/);
});

test("ongeldige heartbeat wordt geweigerd", () => {
  assert.throws(() => loadConfig(base({ SCREEN_HEARTBEAT_SECONDS: "1" })), /SCREEN_HEARTBEAT_SECONDS/);
  assert.throws(() => loadConfig(base({ SCREEN_OFFLINE_AFTER_SECONDS: "5" })), /SCREEN_OFFLINE_AFTER_SECONDS/);
});

test("placeholder als wachtwoord is ongeldig in productie", () => {
  assert.throws(() => loadConfig(base({ POSTGRES_PASSWORD: "change-me" })), /Placeholder/);
  assert.throws(
    () => loadConfig(base({ DATABASE_URL: "postgresql://tzg:change-me@postgres:5432/tzg" })),
    /Placeholder/,
  );
});

test("Graph uitgeschakeld zonder Graph-secret is geldig", () => {
  const config = loadConfig(base({ GRAPH_TENANT_ID: "", GRAPH_CLIENT_ID: "", GRAPH_CLIENT_SECRET: "" }));
  assert.equal(config.graphEnabled, false);
});

test("Graph ingeschakeld zonder Graph-secret is ongeldig", () => {
  assert.throws(() => loadConfig(base({ GRAPH_ENABLED: "true" })), /GRAPH_CLIENT_SECRET|GRAPH_TENANT_ID|GRAPH_CLIENT_ID/);
  assert.throws(() => loadConfig(base({ GRAPH_TENANT_ID: "tid", GRAPH_CLIENT_ID: "cid" })), /GRAPH_CLIENT_SECRET/);
});

test("foutmeldingen bevatten geen secrets", () => {
  try {
    loadConfig(base({ POSTGRES_PASSWORD: "super-geheim-wachtwoord-xyz", DATABASE_URL: "postgresql://tzg:super-geheim-wachtwoord-xyz@postgres:5432/tzg", GRAPH_CLIENT_SECRET: "" }));
    loadConfig(base({ GRAPH_ENABLED: "true", GRAPH_TENANT_ID: "t", GRAPH_CLIENT_ID: "c", GRAPH_CLIENT_SECRET: "" }));
    assert.fail("verwachtte fout");
  } catch (error) {
    assert.ok(error instanceof ConfigError);
    assert.equal(error.message.includes("super-geheim"), false);
    assert.equal(error.message.includes("postgresql://"), false);
  }
  try {
    loadConfig(base({ GRAPH_ENABLED: "true", GRAPH_TENANT_ID: "tenant", GRAPH_CLIENT_ID: "client", GRAPH_CLIENT_SECRET: "echt-geheim" }));
  } catch (error) {
    assert.ok(error instanceof Error);
    assert.equal(error.message.includes("echt-geheim"), false);
  }
});
