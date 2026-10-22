import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  buildDieselSurchargeFromRecords,
  floorSurchargePercentage,
  resolveDieselFieldNames,
  selectLatestTwoByPeildatum,
} from "./sharePointDieselProvider.js";

test("selectie Peildatum DESC zonder Actief/WebsiteWeek-filter", () => {
  const { latest, previous } = selectLatestTwoByPeildatum([
    {
      itemId: "1",
      referenceDate: "2026-10-14",
      websiteWeek: 43,
      dieselPricePerLiter: 2.2438,
      rawSurchargePercentage: 28.9,
      displaySurchargePercentage: 28,
      actief: true,
    },
    {
      itemId: "2",
      referenceDate: "2026-10-21",
      websiteWeek: 44,
      dieselPricePerLiter: 2.2355,
      rawSurchargePercentage: 28.62,
      displaySurchargePercentage: 28,
      actief: false,
    },
  ]);
  assert.equal(latest?.itemId, "2");
  assert.equal(previous?.itemId, "1");
  assert.equal(latest?.websiteWeek, 44);
});

test("API-payload gebruikt WebsiteWeek + floor display", () => {
  const payload = buildDieselSurchargeFromRecords([
    {
      itemId: "prev",
      referenceDate: "2026-10-14",
      websiteWeek: 43,
      dieselPricePerLiter: 2.2438,
      rawSurchargePercentage: 28.9,
      displaySurchargePercentage: floorSurchargePercentage(28.9),
      actief: false,
    },
    {
      itemId: "latest",
      referenceDate: "2026-10-21",
      websiteWeek: 44,
      dieselPricePerLiter: 2.2355,
      rawSurchargePercentage: 28.62,
      displaySurchargePercentage: floorSurchargePercentage(28.62),
      actief: false,
    },
  ]);
  assert.equal(payload.websiteWeek, 44);
  assert.equal(payload.toeslagPercentageDisplay, 28);
  assert.equal(payload.toeslagPercentageRaw, 28.62);
  assert.equal(payload.weken[1]!.websiteWeek, 43);
  assert.equal(payload.weken[1]!.toeslagPercentageDisplay, 28);
});

test("Graph kolomresolutie vereist WebsiteWeek", () => {
  assert.throws(
    () =>
      resolveDieselFieldNames([
        { name: "Peildatum", displayName: "Peildatum" },
        { name: "DieselprijsPerLiter", displayName: "DieselprijsPerLiter" },
        { name: "ToeslagPercentage", displayName: "ToeslagPercentage" },
      ]),
    /WebsiteWeek/,
  );
});

test("providerbron hardcodet geen Week 44 / 28%", () => {
  const src = readFileSync(fileURLToPath(new URL("./sharePointDieselProvider.ts", import.meta.url)), "utf8");
  assert.equal(src.includes("websiteWeek: 44"), false);
  assert.equal(src.includes("Week 44"), false);
  assert.equal(/toeslagPercentage:\s*28\b/.test(src), false);
  assert.equal(src.includes("selectLatestTwoByPeildatum"), true);
  assert.equal(src.includes("WebsiteWeek"), true);
});
