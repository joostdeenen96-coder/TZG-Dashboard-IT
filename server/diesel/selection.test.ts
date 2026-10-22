import assert from "node:assert/strict";
import test from "node:test";
import {
  mapSharePointFieldsToRecord,
  resolveDieselFieldNames,
  selectLatestTwoByPeildatum,
  type DieselSurchargeRecord,
} from "./selection.js";
import { buildDieselSurchargeFromRecords } from "../providers/sharePointDieselProvider.js";

function rec(
  partial: Omit<DieselSurchargeRecord, "isoWeek" | "actief"> & Partial<Pick<DieselSurchargeRecord, "isoWeek" | "actief">>,
): DieselSurchargeRecord {
  return {
    isoWeek: partial.isoWeek ?? 1,
    actief: partial.actief ?? false,
    ...partial,
  };
}

test("D1 records gesorteerd op Peildatum DESC", () => {
  const { sorted } = selectLatestTwoByPeildatum([
    rec({ itemId: "a", referenceDate: "2026-10-07", dieselPricePerLiter: 2.1, surchargePercentage: 30 }),
    rec({ itemId: "b", referenceDate: "2026-10-14", dieselPricePerLiter: 2.2, surchargePercentage: 28.9 }),
    rec({ itemId: "c", referenceDate: "2026-09-30", dieselPricePerLiter: 2.0, surchargePercentage: 29 }),
  ]);
  assert.deepEqual(
    sorted.map((row) => row.referenceDate),
    ["2026-10-14", "2026-10-07", "2026-09-30"],
  );
});

test("D2/D3 exact nieuwste en een-na-nieuwste", () => {
  const { latest, previous } = selectLatestTwoByPeildatum([
    rec({ itemId: "old", referenceDate: "2026-09-30", dieselPricePerLiter: 2, surchargePercentage: 1, actief: true }),
    rec({ itemId: "mid", referenceDate: "2026-10-07", dieselPricePerLiter: 2.2769, surchargePercentage: 30, actief: false }),
    rec({ itemId: "new", referenceDate: "2026-10-14", dieselPricePerLiter: 2.2438, surchargePercentage: 28.9, actief: false }),
  ]);
  assert.equal(latest?.itemId, "new");
  assert.equal(previous?.itemId, "mid");
});

test("D5/D13/D14 weeknummer en Actief beïnvloeden selectie niet; ontbrekende tussenweek irrelevant", () => {
  const { latest, previous } = selectLatestTwoByPeildatum([
    rec({ itemId: "1", referenceDate: "2026-09-16", dieselPricePerLiter: 1, surchargePercentage: 10, actief: true, isoWeek: 38 }),
    // week 39 ontbreekt bewust
    rec({ itemId: "2", referenceDate: "2026-10-07", dieselPricePerLiter: 2, surchargePercentage: 20, actief: false, isoWeek: 41 }),
    rec({ itemId: "3", referenceDate: "2026-10-14", dieselPricePerLiter: 3, surchargePercentage: 30, actief: false, isoWeek: 42 }),
  ]);
  assert.equal(latest?.referenceDate, "2026-10-14");
  assert.equal(previous?.referenceDate, "2026-10-07");
  assert.equal(latest?.actief, false);
});

test("D4/D12/D6–D11 één record = één tegel met exacte decimalen", () => {
  const payload = buildDieselSurchargeFromRecords([
    rec({ itemId: "prev", referenceDate: "2026-10-07", dieselPricePerLiter: 2.2769, surchargePercentage: 30, isoWeek: 41 }),
    rec({ itemId: "latest", referenceDate: "2026-10-14", dieselPricePerLiter: 2.2438, surchargePercentage: 28.9, isoWeek: 42 }),
  ]);
  assert.equal(payload.weken.length, 2);
  assert.equal(payload.weken[0]!.itemId, "latest");
  assert.equal(payload.weken[0]!.dieselPrijs, 2.2438);
  assert.equal(payload.weken[0]!.toeslagPercentage, 28.9);
  assert.equal(payload.weken[0]!.peildatum, "2026-10-14");
  assert.equal(payload.weken[0]!.isoWeek, 42);
  assert.equal(payload.weken[1]!.itemId, "prev");
  assert.equal(payload.weken[1]!.dieselPrijs, 2.2769);
  assert.equal(payload.weken[1]!.toeslagPercentage, 30);
  assert.equal(payload.weken[1]!.isoWeek, 41);
  assert.equal(payload.toeslagPercentage.toFixed(2), "28.90");
  assert.equal(payload.dieselPrijs.toFixed(4), "2.2438");
});

test("D15 jaarwisseling: peildatum bepaalt volgorde, niet weeklabel", () => {
  const { latest, previous } = selectLatestTwoByPeildatum([
    rec({ itemId: "a", referenceDate: "2025-12-30", dieselPricePerLiter: 1.1, surchargePercentage: 9.99, isoWeek: 1 }),
    rec({ itemId: "b", referenceDate: "2026-01-06", dieselPricePerLiter: 1.2, surchargePercentage: 10.12, isoWeek: 2 }),
  ]);
  assert.equal(latest?.referenceDate, "2026-01-06");
  assert.equal(previous?.referenceDate, "2025-12-30");
});

test("resolveDieselFieldNames gebruikt Graph displayName ToeslagPercent… + DieselprijsPerLiter", () => {
  const names = resolveDieselFieldNames([
    { name: "Title", displayName: "Title" },
    { name: "Peildatum", displayName: "Peildatum" },
    { name: "DieselprijsPerLiter", displayName: "DieselprijsPerLiter" },
    { name: "field_7", displayName: "ToeslagPercentage" },
    { name: "Actief", displayName: "Actief" },
  ]);
  assert.equal(names.dieselPrijs, "DieselprijsPerLiter");
  assert.equal(names.toeslagPercentage, "field_7");
  assert.equal(names.peildatum, "Peildatum");
  assert.equal(names.actief, "Actief");
});

test("mapSharePointFieldsToRecord koppelt prijs/toeslag/peildatum uit dezelfde fields", () => {
  const record = mapSharePointFieldsToRecord(
    "42",
    {
      Peildatum: "2026-10-14T00:00:00Z",
      DieselprijsPerLiter: "2,2438",
      field_7: 28.9,
      Actief: false,
    },
    {
      peildatum: "Peildatum",
      dieselPrijs: "DieselprijsPerLiter",
      toeslagPercentage: "field_7",
      actief: "Actief",
    },
  );
  assert.equal(record.itemId, "42");
  assert.equal(record.referenceDate, "2026-10-14");
  assert.equal(record.dieselPricePerLiter, 2.2438);
  assert.equal(record.surchargePercentage, 28.9);
  assert.equal(record.isoWeek, 42);
});
