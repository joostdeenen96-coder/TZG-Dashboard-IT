import assert from "node:assert/strict";
import test from "node:test";
import {
  formatDutchPeildatum,
  isoWeekFromCalendarDate,
  isoWeekFromPeildatumIso,
  peildatumToCalendarIso,
} from "./peildatum.js";

test("peildatum YYYY-MM-DD blijft kalenderdatum", () => {
  assert.equal(peildatumToCalendarIso("2026-10-14"), "2026-10-14");
});

test("SharePoint UTC-avond naar Amsterdam-kalenderdag", () => {
  // 13-10 22:00Z = 14-10 00:00 Europe/Amsterdam (CEST)
  assert.equal(peildatumToCalendarIso("2026-10-13T22:00:00Z"), "2026-10-14");
});

test("ISO-week begin/einde jaar en weekgrenzen", () => {
  assert.deepEqual(isoWeekFromCalendarDate(2026, 1, 1), { isoYear: 2026, isoWeek: 1 }); // donderdag
  assert.deepEqual(isoWeekFromCalendarDate(2025, 12, 29), { isoYear: 2026, isoWeek: 1 }); // maandag → week 1 2026
  assert.deepEqual(isoWeekFromCalendarDate(2025, 12, 28), { isoYear: 2025, isoWeek: 52 }); // zondag
  assert.deepEqual(isoWeekFromCalendarDate(2026, 10, 14), { isoYear: 2026, isoWeek: 42 }); // woensdag
  assert.deepEqual(isoWeekFromCalendarDate(2026, 10, 12), { isoYear: 2026, isoWeek: 42 }); // maandag
  assert.deepEqual(isoWeekFromCalendarDate(2026, 10, 11), { isoYear: 2026, isoWeek: 41 }); // zondag
  assert.deepEqual(isoWeekFromCalendarDate(2026, 12, 31), { isoYear: 2026, isoWeek: 53 });
});

test("isoWeekFromPeildatumIso + Nederlandse peildatumweergave", () => {
  assert.equal(isoWeekFromPeildatumIso("2026-10-14").isoWeek, 42);
  assert.equal(formatDutchPeildatum("2026-10-07"), "07-10-2026");
});
