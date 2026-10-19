import assert from "node:assert/strict";
import test from "node:test";
import {
  DashboardValidationError,
  parseDashboardCreateInput,
  parseDashboardDefinition,
  parseDashboardStore,
} from "./model.js";
import { createDefaultDashboards } from "./seed.js";

const base = () => createDefaultDashboards("2026-01-01T00:00:00.000Z")[0]!;

test("parseDashboardDefinition accepteert planning-seed", () => {
  const parsed = parseDashboardDefinition(base());
  assert.equal(parsed.slug, "planning");
  assert.equal(parsed.enabled, true);
  assert.ok(parsed.widgets.length >= 4);
  assert.equal(parsed.layout.preset, "planning");
});

test("parseDashboardDefinition weigert onbekend widgettype", () => {
  const row = structuredClone(base());
  row.widgets[0] = { ...row.widgets[0]!, type: "unknown" as "text" };
  assert.throws(() => parseDashboardDefinition(row), DashboardValidationError);
});

test("parseDashboardDefinition weigert ongeldige slug", () => {
  const row = { ...base(), slug: "Bad Slug!" };
  assert.throws(() => parseDashboardDefinition(row), /Slug/);
});

test("parseDashboardStore weigert dubbele slug", () => {
  const a = base();
  const b = { ...createDefaultDashboards("2026-01-01T00:00:00.000Z")[1]!, slug: a.slug };
  assert.throws(() => parseDashboardStore({ version: 1, dashboards: [a, b] }), /Dubbele slug/);
});

test("parseDashboardStore weigert ongeldige versie zonder crash te forceren", () => {
  assert.throws(() => parseDashboardStore({ version: 99, dashboards: [] }), DashboardValidationError);
});

test("parseDashboardCreateInput valideert minimale input", () => {
  const input = parseDashboardCreateInput({ name: "Test", slug: "test-scherm" });
  assert.equal(input.name, "Test");
  assert.equal(input.slug, "test-scherm");
});
