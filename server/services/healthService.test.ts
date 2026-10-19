import assert from "node:assert/strict";
import test from "node:test";
import { getHealth } from "./healthService.js";

test("getHealth geeft status en version zonder secrets", async () => {
  const health = await getHealth();
  assert.ok(health.status === "healthy" || health.status === "degraded");
  assert.equal(typeof health.version, "string");
  assert.ok(health.version.length > 0);
  assert.equal(health.services.api, "healthy");
  assert.equal(health.services.configuration, "healthy");
  assert.ok(
    health.services.dashboardRepository === "healthy" || health.services.dashboardRepository === "unhealthy",
  );
  const serialized = JSON.stringify(health);
  assert.equal(serialized.includes("secret"), false);
  assert.equal(serialized.includes("token"), false);
  assert.equal(serialized.includes("password"), false);
  assert.equal(serialized.includes("widgets"), false);
});
