import assert from "node:assert/strict";
import test from "node:test";
import { sanitize } from "./log.js";

test("logsanitization verwijdert secrets en tokens", () => {
  const raw =
    "Authorization: Bearer abc.def.ghi password=supergeheim DATABASE_URL=postgresql://tzg:geheim@postgres:5432/tzg " +
    "GRAPH_CLIENT_SECRET=abc123 tzg_abcdefghijklmnopqrstuvwxyz012345 PRTG_PASSHASH=ffff cookie=sid=1";
  const clean = sanitize(raw);
  assert.equal(clean.includes("supergeheim"), false);
  assert.equal(clean.includes("postgresql://tzg:geheim"), false);
  assert.equal(clean.includes("abc123"), false);
  assert.equal(clean.includes("tzg_abcdefghijklmnopqrstuvwxyz012345"), false);
  assert.equal(clean.includes("ffff"), false);
  assert.match(clean, /Bearer \[redacted\]/);
  assert.match(clean, /DATABASE_URL=\[redacted\]/);
  assert.match(clean, /tzg_\[redacted\]/);
});
