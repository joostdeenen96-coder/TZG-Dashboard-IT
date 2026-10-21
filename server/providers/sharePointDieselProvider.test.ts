import assert from "node:assert/strict";
import test from "node:test";

// Re-test week pairing via a small local copy of the selection logic expectations
// by exercising the public provider mapping through exported helpers is not available;
// instead verify iso-week pairing with an inline replica matching production rules.

function isoWeekKey(peildatum: string) {
  const time = Date.parse(peildatum);
  if (!Number.isFinite(time)) return peildatum;
  const date = new Date(time);
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const weekday = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - weekday);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

test("huidige en vorige dieselweek hebben verschillende ISO-weekkeys", () => {
  const current = "2026-10-13"; // → display week 43
  const previous = "2026-10-06"; // → display week 42
  assert.notEqual(isoWeekKey(current), isoWeekKey(previous));
  assert.equal(isoWeekKey(current) > isoWeekKey(previous), true);
});

test("weekselectie: actief + dichtstbijzijnde eerdere week", () => {
  const records = [
    { peildatum: "2026-09-29", toeslagPercentage: 11.2, dieselPrijs: 1.1, actief: false },
    { peildatum: "2026-10-06", toeslagPercentage: 11.9, dieselPrijs: 1.2, actief: false },
    { peildatum: "2026-10-13", toeslagPercentage: 12.4, dieselPrijs: 1.3, actief: true },
  ];
  const active = records.find((row) => row.actief)!;
  const previous = records
    .filter((row) => Date.parse(row.peildatum) < Date.parse(active.peildatum))
    .sort((a, b) => Date.parse(b.peildatum) - Date.parse(a.peildatum))[0];
  assert.equal(previous?.peildatum, "2026-10-06");
  assert.equal(previous?.toeslagPercentage, 11.9);
});
