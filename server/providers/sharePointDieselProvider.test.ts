import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildDieselSurchargeFromRecords,
  resolveDieselFieldNames,
  selectLatestTwoByPeildatum,
} from "./sharePointDieselProvider.js";

test("selectie is peildatum DESC zonder Actief-filter", () => {
  const { latest, previous } = selectLatestTwoByPeildatum([
    {
      itemId: "1",
      referenceDate: "2026-10-07",
      isoWeek: 41,
      dieselPricePerLiter: 2.2769,
      surchargePercentage: 30,
      actief: true,
    },
    {
      itemId: "2",
      referenceDate: "2026-10-14",
      isoWeek: 42,
      dieselPricePerLiter: 2.2438,
      surchargePercentage: 28.9,
      actief: false,
    },
  ]);
  assert.equal(latest?.itemId, "2");
  assert.equal(previous?.itemId, "1");
  assert.equal(latest?.actief, false);
});

test("API-payload weken nieuwste eerst met gekoppelde velden", () => {
  const payload = buildDieselSurchargeFromRecords([
    {
      itemId: "prev",
      referenceDate: "2026-10-07",
      isoWeek: 41,
      dieselPricePerLiter: 2.2769,
      surchargePercentage: 30,
      actief: false,
    },
    {
      itemId: "latest",
      referenceDate: "2026-10-14",
      isoWeek: 42,
      dieselPricePerLiter: 2.2438,
      surchargePercentage: 28.9,
      actief: false,
    },
  ]);
  assert.equal(payload.weken[0]!.peildatum, payload.peildatum);
  assert.equal(payload.weken[0]!.dieselPrijs, payload.dieselPrijs);
  assert.equal(payload.weken[0]!.toeslagPercentage, payload.toeslagPercentage);
});

test("Graph kolomresolutie vereist DieselprijsPerLiter en ToeslagPercent-prefix", () => {
  assert.throws(() => resolveDieselFieldNames([{ name: "Peildatum", displayName: "Peildatum" }]), /DieselprijsPerLiter/);
  const names = resolveDieselFieldNames([
    { name: "Peildatum", displayName: "Peildatum" },
    { name: "DieselprijsPerLiter", displayName: "Dieselprijs per liter" },
    { name: "OData__x0054_oeslag", displayName: "ToeslagPercentage" },
  ]);
  assert.equal(names.toeslagPercentage, "OData__x0054_oeslag");
});

test("providerbron bevat geen hardcoded acceptatiepeildatums als runtime-default", () => {
  const src = readFileSync(fileURLToPath(new URL("./sharePointDieselProvider.ts", import.meta.url)), "utf8");
  assert.equal(src.includes("2.2438"), false);
  assert.equal(src.includes("28.90"), false);
  assert.equal(src.includes("selectLatestTwoByPeildatum"), true);
  assert.equal(path.basename(fileURLToPath(import.meta.url)), "sharePointDieselProvider.test.ts");
});
