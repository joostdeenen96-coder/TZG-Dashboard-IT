import assert from "node:assert/strict";
import test from "node:test";
import {
  addApplicableMonths,
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

test("G9 UI-maand volgt de kalendergrenzen in Europe/Amsterdam", () => {
  const cases: Array<[string, string, string]> = [
    ["2026-10-23T12:00:00+02:00", "2026-10", "2026-11"],
    ["2026-10-31T23:59:00+01:00", "2026-10", "2026-11"],
    ["2026-11-01T00:00:00+01:00", "2026-11", "2026-12"],
    ["2026-11-30T18:00:00+01:00", "2026-11", "2026-12"],
    ["2026-12-01T00:00:00+01:00", "2026-12", "2027-01"],
    ["2026-12-31T23:59:00+01:00", "2026-12", "2027-01"],
    ["2027-01-01T00:00:00+01:00", "2027-01", "2027-02"],
  ];
  for (const [iso, current, next] of cases) {
    const now = new Date(iso);
    assert.equal(currentApplicableMonth(now), current, iso);
    assert.equal(addApplicableMonths(currentApplicableMonth(now)), next, iso);
  }
});

test("peildatumhulp blijft de 15e-regel, los van de UI-kalendermaand", () => {
  const october31 = new Date("2026-10-31T12:00:00+01:00");
  const november1 = new Date("2026-11-01T12:00:00+01:00");
  const december31 = new Date("2026-12-31T12:00:00+01:00");
  const january1 = new Date("2027-01-01T12:00:00+01:00");
  assert.equal(currentApplicableMonthNetherlands(october31), "2026-11");
  assert.equal(addApplicableMonths(currentApplicableMonthNetherlands(october31)), "2026-12");
  assert.equal(currentApplicableMonthNetherlands(november1), "2026-11");
  assert.equal(addApplicableMonths(currentApplicableMonthNetherlands(november1)), "2026-12");
  assert.equal(currentApplicableMonthNetherlands(december31), "2027-01");
  assert.equal(addApplicableMonths(currentApplicableMonthNetherlands(december31)), "2027-02");
  assert.equal(currentApplicableMonthNetherlands(january1), "2027-01");
  assert.equal(addApplicableMonths(currentApplicableMonthNetherlands(january1)), "2027-02");
  assert.equal(addApplicableMonths("2026-12"), "2027-01");
  const october23 = new Date("2026-10-23T12:00:00+02:00");
  assert.equal(currentApplicableMonth(october23), "2026-10");
  assert.equal(currentApplicableMonthNetherlands(october23), "2026-11");
});

test("currentApplicableMonthNetherlands: vanaf 15e → volgende maand", () => {
  assert.equal(currentApplicableMonthNetherlands(new Date("2026-10-10T12:00:00+02:00")), "2026-10");
  assert.equal(currentApplicableMonthNetherlands(new Date("2026-10-15T00:00:00+02:00")), "2026-11");
  assert.equal(currentApplicableMonthNetherlands(new Date("2026-10-22T12:00:00+02:00")), "2026-11");
  assert.equal(currentApplicableMonthNetherlands(new Date("2026-11-05T12:00:00+01:00")), "2026-11");
  assert.equal(currentApplicableMonthNetherlands(new Date("2026-11-15T12:00:00+01:00")), "2026-12");
});
