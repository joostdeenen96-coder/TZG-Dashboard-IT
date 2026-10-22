/**
 * Schepenplanning-scorecard wijst naar de gedragingstests in shipPlanning.test.ts.
 * Live query op TEU-NC-01: npm run ship-planning:test-query
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");

test("documentatie noemt de bewezen datasource zonder wachtwoord", () => {
  const docs = readFileSync(path.join(root, "docs/SCHEPENPLANNING.md"), "utf8");
  assert.match(docs, /entityTypeId \| 255/);
  assert.match(docs, /Europe\/Amsterdam/);
  assert.match(docs, /laaddatum/);
  assert.match(docs, /losdatum/);
  assert.equal(docs.includes("SHIP_PLANNING_PASSWORD="), false);
});
