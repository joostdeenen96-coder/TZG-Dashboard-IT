import assert from "node:assert/strict";
import test from "node:test";
import {
  applicableMonthFromReferenceDate,
  currentApplicableMonth,
  currentApplicableMonthNetherlands,
  referenceDateForApplicableMonth,
} from "./monthLogic.js";

test("15e bepaalt volgende toepassingsmaand", () => {
  assert.equal(applicableMonthFromReferenceDate("2026-10-15"), "2026-11");
  assert.equal(referenceDateForApplicableMonth("2026-11"), "2026-10-15");
  assert.equal(referenceDateForApplicableMonth("2026-10"), "2026-09-15");
  assert.equal(referenceDateForApplicableMonth("2026-01"), "2025-12-15");
  assert.equal(applicableMonthFromReferenceDate("2025-12-15"), "2026-01");
  assert.equal(referenceDateForApplicableMonth("2027-01"), "2026-12-15");
});

test("currentApplicableMonth (BE) gebruikt Amsterdam-kalendermaand", () => {
  assert.equal(currentApplicableMonth(new Date("2026-10-21T12:00:00+02:00")), "2026-10");
  assert.equal(currentApplicableMonth(new Date("2026-10-10T12:00:00+02:00")), "2026-10");
});

test("currentApplicableMonthNetherlands: vanaf 15e → volgende maand", () => {
  assert.equal(currentApplicableMonthNetherlands(new Date("2026-10-10T12:00:00+02:00")), "2026-10");
  assert.equal(currentApplicableMonthNetherlands(new Date("2026-10-15T00:00:00+02:00")), "2026-11");
  assert.equal(currentApplicableMonthNetherlands(new Date("2026-10-22T12:00:00+02:00")), "2026-11");
  assert.equal(currentApplicableMonthNetherlands(new Date("2026-11-05T12:00:00+01:00")), "2026-11");
  assert.equal(currentApplicableMonthNetherlands(new Date("2026-11-15T12:00:00+01:00")), "2026-12");
});
