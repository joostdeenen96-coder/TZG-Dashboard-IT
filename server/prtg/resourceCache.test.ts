import assert from "node:assert/strict";
import test from "node:test";
import { createResourceCache } from "./resourceCache.js";

test("SR1 SR2 SR3 cache haalt opnieuw op na 60 seconden", async () => {
  let now = 0;
  let calls = 0;
  const cache = createResourceCache({
    ttlMs: 60_000,
    now: () => now,
    load: async () => {
      calls += 1;
      return calls;
    },
  });
  const first = await cache.read("a");
  assert.equal(first.cacheStatus, "miss");
  assert.equal(first.value, 1);
  const second = await cache.read("a");
  assert.equal(second.cacheStatus, "hit");
  assert.equal(calls, 1);
  now = 60_000;
  const third = await cache.read("a");
  assert.equal(third.cacheStatus, "miss");
  assert.equal(third.value, 2);
  assert.equal(calls, 2);
});

test("SR4 gelijktijdige requests delen één PRTG-aanvraag", async () => {
  let calls = 0;
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const cache = createResourceCache({
    load: async () => {
      calls += 1;
      await gate;
      return "ok";
    },
  });
  const pending = Promise.all([cache.read("a"), cache.read("a")]);
  release();
  const [left, right] = await pending;
  assert.equal(calls, 1);
  assert.equal(left.cacheStatus, "miss");
  assert.equal(right.cacheStatus, "miss");
  assert.equal(left.value, "ok");
});

test("SR5 cache is per server gescheiden", async () => {
  const cache = createResourceCache({
    load: async (id) => id,
  });
  assert.equal((await cache.read("een")).value, "een");
  assert.equal((await cache.read("twee")).value, "twee");
  assert.equal(cache.size(), 2);
});

test("SR6 SR7 SR8 stale, leeg en herstel", async () => {
  let now = 0;
  let fail = false;
  const cache = createResourceCache({
    ttlMs: 60_000,
    now: () => now,
    load: async () => {
      if (fail) throw new Error("PRTG weg");
      return "goed";
    },
  });
  fail = true;
  const missing = await cache.read("a");
  assert.equal(missing.cacheStatus, "unavailable");
  assert.equal(missing.value, null);
  assert.equal(missing.staleReason, "PRTG weg");
  fail = false;
  now = 60_000;
  assert.equal((await cache.read("a")).cacheStatus, "miss");
  fail = true;
  now = 120_000;
  const stale = await cache.read("a");
  assert.equal(stale.cacheStatus, "stale");
  assert.equal(stale.value, "goed");
  fail = false;
  now = 180_000;
  const recovered = await cache.read("a");
  assert.equal(recovered.cacheStatus, "miss");
  assert.equal(recovered.value, "goed");
});
