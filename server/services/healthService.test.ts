import assert from "node:assert/strict";
import test from "node:test";
import { getHealth } from "./healthService.js";

test("getHealth geeft status en version zonder secrets", () => {
  const health = getHealth();
  assert.equal(health.status, "healthy");
  assert.equal(typeof health.version, "string");
  assert.ok(health.version.length > 0);
  assert.equal(health.services.api, "healthy");
  assert.equal(health.services.configuration, "healthy");
  const serialized = JSON.stringify(health);
  assert.equal(serialized.includes("secret"), false);
  assert.equal(serialized.includes("token"), false);
  assert.equal(serialized.includes("password"), false);
});
