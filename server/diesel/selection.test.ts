import assert from "node:assert/strict";
import test from "node:test";
import {
  floorSurchargePercentage,
  mapSharePointFieldsToRecord,
  pickToeslagPercentageColumnName,
  resolveDieselFieldNames,
  selectLatestTwoByPeildatum,
  type DieselSurchargeRecord,
} from "./selection.js";
import { buildDieselSurchargeFromRecords } from "../providers/sharePointDieselProvider.js";
import { isoWeekFromCalendarDate } from "./peildatum.js";

function rec(
  partial: Omit<DieselSurchargeRecord, "displaySurchargePercentage" | "actief"> &
    Partial<Pick<DieselSurchargeRecord, "displaySurchargePercentage" | "actief">>,
): DieselSurchargeRecord {
  return {
    displaySurchargePercentage:
      partial.displaySurchargePercentage ?? floorSurchargePercentage(partial.rawSurchargePercentage),
    actief: partial.actief ?? false,
    ...partial,
  };
}

test("Math.floor toeslagweergave — alle businessvoorbeelden", () => {
  const cases: Array<[number, number]> = [
    [28.0, 28],
    [28.01, 28],
    [28.62, 28],
    [28.9, 28],
    [28.99, 28],
    [29.0, 29],
    [29.99, 29],
    [30.0, 30],
    [30.99, 30],
    [32.76, 32],
  ];
  for (const [raw, expected] of cases) {
    assert.equal(floorSurchargePercentage(raw), expected, `${raw} → ${expected}`);
  }
});

test("geen Math.round in floor-helper (28.9 blijft 28)", () => {
  assert.equal(floorSurchargePercentage(28.9), 28);
  assert.notEqual(floorSurchargePercentage(28.9), Math.round(28.9));
});

test("D1 records gesorteerd op Peildatum DESC", () => {
  const { sorted } = selectLatestTwoByPeildatum([
    rec({
      itemId: "a",
      referenceDate: "2026-10-07",
      websiteWeek: 41,
      dieselPricePerLiter: 2.1,
      rawSurchargePercentage: 30,
    }),
    rec({
      itemId: "b",
      referenceDate: "2026-10-21",
      websiteWeek: 44,
      dieselPricePerLiter: 2.2,
      rawSurchargePercentage: 28.62,
    }),
    rec({
      itemId: "c",
      referenceDate: "2026-09-30",
      websiteWeek: 40,
      dieselPricePerLiter: 2.0,
      rawSurchargePercentage: 29,
    }),
  ]);
  assert.deepEqual(
    sorted.map((row) => row.referenceDate),
    ["2026-10-21", "2026-10-07", "2026-09-30"],
  );
});

test("WebsiteWeek 44 bij peildatum 21-10-2026 ongeacht ISO-week", () => {
  const iso = isoWeekFromCalendarDate(2026, 10, 21).isoWeek;
  assert.notEqual(iso, 44); // fixture bewust anders dan ISO
  const payload = buildDieselSurchargeFromRecords([
    rec({
      itemId: "latest",
      referenceDate: "2026-10-21",
      websiteWeek: 44,
      dieselPricePerLiter: 2.2355,
      rawSurchargePercentage: 28.62,
    }),
    rec({
      itemId: "prev",
      referenceDate: "2026-10-14",
      websiteWeek: 43,
      dieselPricePerLiter: 2.2438,
      rawSurchargePercentage: 28.9,
    }),
  ]);
  assert.equal(payload.weken[0]!.websiteWeek, 44);
  assert.equal(payload.weken[0]!.toeslagPercentageDisplay, 28);
  assert.equal(payload.weken[0]!.toeslagPercentageRaw, 28.62);
  assert.equal(payload.weken[1]!.websiteWeek, 43);
  assert.equal(payload.weken[1]!.toeslagPercentageDisplay, 28);
});

test("Actief en WebsiteWeek beïnvloeden selectie niet", () => {
  const { latest, previous } = selectLatestTwoByPeildatum([
    rec({
      itemId: "1",
      referenceDate: "2026-09-16",
      websiteWeek: 99,
      dieselPricePerLiter: 1,
      rawSurchargePercentage: 10,
      actief: true,
    }),
    rec({
      itemId: "2",
      referenceDate: "2026-10-07",
      websiteWeek: 41,
      dieselPricePerLiter: 2,
      rawSurchargePercentage: 20,
      actief: false,
    }),
    rec({
      itemId: "3",
      referenceDate: "2026-10-21",
      websiteWeek: 44,
      dieselPricePerLiter: 3,
      rawSurchargePercentage: 30,
      actief: false,
    }),
  ]);
  assert.equal(latest?.referenceDate, "2026-10-21");
  assert.equal(previous?.referenceDate, "2026-10-07");
});

test("pickToeslagPercentageColumnName kiest decimale bronkolom", () => {
  const columns = [
    { name: "ToeslagPercentage", displayName: "ToeslagPercentage" },
    { name: "ToeslagPercentageAfr", displayName: "ToeslagPercentageAfronding" },
  ];
  const samples = [
    { ToeslagPercentage: 28.9, ToeslagPercentageAfr: 29 },
    { ToeslagPercentage: 32.76, ToeslagPercentageAfr: 33 },
    { ToeslagPercentage: 30.0, ToeslagPercentageAfr: 30 },
  ];
  assert.equal(pickToeslagPercentageColumnName(columns, samples), "ToeslagPercentage");
});

test("resolveDieselFieldNames vereist WebsiteWeek + DieselprijsPerLiter", () => {
  const names = resolveDieselFieldNames(
    [
      { name: "Peildatum", displayName: "Peildatum" },
      { name: "WebsiteWeek", displayName: "WebsiteWeek" },
      { name: "DieselprijsPerLiter", displayName: "DieselprijsPerLiter" },
      { name: "field_7", displayName: "ToeslagPercentage" },
    ],
    [{ field_7: 28.9 }],
  );
  assert.equal(names.websiteWeek, "WebsiteWeek");
  assert.equal(names.toeslagPercentage, "field_7");
});

test("mapSharePointFieldsToRecord koppelt WebsiteWeek + floor", () => {
  const record = mapSharePointFieldsToRecord(
    "42",
    {
      Peildatum: "2026-10-21T00:00:00Z",
      WebsiteWeek: 44,
      DieselprijsPerLiter: "2,2355",
      field_7: 28.62,
      Actief: false,
    },
    {
      peildatum: "Peildatum",
      websiteWeek: "WebsiteWeek",
      dieselPrijs: "DieselprijsPerLiter",
      toeslagPercentage: "field_7",
      actief: "Actief",
    },
  );
  assert.equal(record.websiteWeek, 44);
  assert.equal(record.rawSurchargePercentage, 28.62);
  assert.equal(record.displaySurchargePercentage, 28);
  assert.equal(record.dieselPricePerLiter, 2.2355);
});
