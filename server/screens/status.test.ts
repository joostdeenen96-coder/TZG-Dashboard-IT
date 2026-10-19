import assert from "node:assert/strict";
import test from "node:test";
import { screenPresence } from "./status.js";

test("schermstatus online offline nooit verbonden uitgeschakeld", () => {
  const now = Date.parse("2026-10-19T12:00:00.000Z");
  assert.equal(screenPresence({ enabled: false, lastSeenAt: new Date(now).toISOString(), now, offlineAfterSeconds: 180 }), "Uitgeschakeld");
  assert.equal(screenPresence({ enabled: true, lastSeenAt: null, now, offlineAfterSeconds: 180 }), "Nooit verbonden");
  assert.equal(
    screenPresence({ enabled: true, lastSeenAt: new Date(now - 60_000).toISOString(), now, offlineAfterSeconds: 180 }),
    "Online",
  );
  assert.equal(
    screenPresence({ enabled: true, lastSeenAt: new Date(now - 181_000).toISOString(), now, offlineAfterSeconds: 180 }),
    "Offline",
  );
});
