import assert from "node:assert/strict";
import test from "node:test";
import { cacheContainsSecrets, nextBackoff } from "./backoff.js";

test("exponential backoff heeft een bovengrens", () => {
  let delay = 2_000;
  const seen = new Set<number>();
  for (let index = 0; index < 10; index += 1) {
    delay = nextBackoff(delay);
    seen.add(delay);
  }
  assert.equal(delay, 60_000);
  assert.ok(seen.has(4_000));
  assert.ok(seen.has(8_000));
});

test("offlinecache zonder token of secret", () => {
  assert.equal(cacheContainsSecrets(JSON.stringify({ dashboard: { slug: "planning" }, appVersion: "0.4.0" })), false);
  assert.equal(cacheContainsSecrets(JSON.stringify({ token: "tzg_abcdefghijklmnopqrstuvwxyz012345" })), true);
});
