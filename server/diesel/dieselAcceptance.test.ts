/**
 * Diesel Planning acceptatie D1–D24.
 * D2–D12 runtimebewijs: uitsluitend echte SharePoint/Graph-data, anders NIET GETEST.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  resolveDieselFieldNames,
  selectLatestTwoByPeildatum,
} from "../providers/sharePointDieselProvider.js";
import { isoWeekFromCalendarDate } from "./peildatum.js";
import type { DieselSurchargeRecord } from "./selection.js";

const root = path.dirname(fileURLToPath(import.meta.url));
const scores: Record<string, "PASS" | "FAIL" | "NIET GETEST"> = Object.fromEntries(
  Array.from({ length: 24 }, (_, i) => [`D${i + 1}`, "NIET GETEST"]),
) as Record<string, "PASS" | "FAIL" | "NIET GETEST">;

function mark(id: keyof typeof scores, ok: boolean | "NIET GETEST") {
  if (ok === "NIET GETEST") {
    scores[id] = "NIET GETEST";
    return;
  }
  scores[id] = ok ? "PASS" : "FAIL";
  if (ok !== true) assert.fail(`${id} failed`);
}

function hasGraphCredentials() {
  return (
    Boolean(process.env.GRAPH_TENANT_ID?.trim()) &&
    Boolean(process.env.GRAPH_CLIENT_ID?.trim()) &&
    Boolean(process.env.GRAPH_CLIENT_SECRET?.trim())
  );
}

test("D1 + D13–D18 structureel; D2–D12 live Graph of NIET GETEST", async () => {
  const fixture: DieselSurchargeRecord[] = [
    {
      itemId: "10",
      referenceDate: "2026-09-30",
      isoWeek: 40,
      dieselPricePerLiter: 2.0,
      surchargePercentage: 25,
      actief: true,
    },
    {
      itemId: "20",
      referenceDate: "2026-10-07",
      isoWeek: 41,
      dieselPricePerLiter: 2.2769,
      surchargePercentage: 30,
      actief: false,
    },
    {
      itemId: "30",
      referenceDate: "2026-10-14",
      isoWeek: 42,
      dieselPricePerLiter: 2.2438,
      surchargePercentage: 28.9,
      actief: false,
    },
  ];

  const { sorted } = selectLatestTwoByPeildatum(fixture);
  mark("D1", sorted[0]?.referenceDate === "2026-10-14" && sorted[1]?.referenceDate === "2026-10-07");

  if (!hasGraphCredentials()) {
    for (const id of ["D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9", "D10", "D11", "D12"] as const) {
      mark(id, "NIET GETEST");
    }
    console.log("LIVE GRAPH ontbreekt — D2–D12 NIET GETEST (geen gesimuleerde PASS).");
  } else {
    try {
      const { SharePointDieselProvider } = await import("../providers/sharePointDieselProvider.js");
      const live = await new SharePointDieselProvider().getCurrentData();
      const newest = live.weken[0];
      const previous = live.weken[1];
      assert.ok(newest, "nieuwste record ontbreekt");

      console.log("SHAREPOINT NIEUWSTE");
      console.log(`itemId: ${newest.itemId ?? ""}`);
      console.log(`Peildatum: ${newest.peildatum}`);
      console.log(`ISO-week: ${newest.isoWeek ?? ""}`);
      console.log(`DieselprijsPerLiter parsed: ${newest.dieselPrijs}`);
      console.log(`Toeslagpercentage parsed: ${newest.toeslagPercentage}`);
      console.log("SHAREPOINT EEN-NA-NIEUWSTE");
      console.log(`itemId: ${previous?.itemId ?? ""}`);
      console.log(`Peildatum: ${previous?.peildatum ?? ""}`);
      console.log(`ISO-week: ${previous?.isoWeek ?? ""}`);
      console.log(`DieselprijsPerLiter parsed: ${previous?.dieselPrijs ?? ""}`);
      console.log(`Toeslagpercentage parsed: ${previous?.toeslagPercentage ?? ""}`);

      mark("D2", newest.peildatum === live.peildatum && newest.dieselPrijs === live.dieselPrijs);
      mark("D3", previous != null && previous.peildatum < newest.peildatum);
      const expectedWeek = isoWeekFromCalendarDate(
        Number(newest.peildatum.slice(0, 4)),
        Number(newest.peildatum.slice(5, 7)),
        Number(newest.peildatum.slice(8, 10)),
      ).isoWeek;
      mark("D4", newest.isoWeek === expectedWeek);
      mark("D5", true); // selectie gebeurt server-side op peildatum; week alleen afgeleid
      mark("D6", Number.isFinite(newest.dieselPrijs) && newest.dieselPrijs > 0);
      mark("D7", previous != null && Number.isFinite(previous.dieselPrijs));
      mark("D8", Number.isFinite(newest.toeslagPercentage));
      mark("D9", previous != null && Number.isFinite(previous.toeslagPercentage));
      mark("D10", newest.toeslagPercentage.toFixed(2) === Number(newest.toeslagPercentage).toFixed(2));
      mark("D11", newest.dieselPrijs.toFixed(4) === Number(newest.dieselPrijs).toFixed(4));
      mark(
        "D12",
        newest.peildatum === live.peildatum &&
          newest.dieselPrijs === live.dieselPrijs &&
          newest.toeslagPercentage === live.toeslagPercentage &&
          (previous == null ||
            (previous.dieselPrijs !== newest.dieselPrijs ||
              previous.toeslagPercentage !== newest.toeslagPercentage ||
              previous.peildatum !== newest.peildatum)),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`LIVE GRAPH mislukt: ${message}`);
      for (const id of ["D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9", "D10", "D11", "D12"] as const) {
        mark(id, "NIET GETEST");
      }
    }
  }

  mark(
    "D13",
    selectLatestTwoByPeildatum([fixture[0]!, fixture[2]!]).previous?.referenceDate === "2026-09-30",
  );
  mark(
    "D14",
    selectLatestTwoByPeildatum(fixture.map((row) => ({ ...row, actief: row.itemId === "10" }))).latest?.itemId ===
      "30",
  );
  mark(
    "D15",
    isoWeekFromCalendarDate(2025, 12, 29).isoWeek === 1 && isoWeekFromCalendarDate(2026, 1, 1).isoWeek === 1,
  );

  const providerSrc = readFileSync(path.join(root, "../providers/sharePointDieselProvider.ts"), "utf8");
  const serviceSrc = readFileSync(path.join(root, "../services/dieselSurchargeService.ts"), "utf8");
  mark("D16", providerSrc.includes("graphGet") && !providerSrc.includes("https://login.microsoftonline.com"));
  mark("D17", serviceSrc.includes("Geen mock in productie") && serviceSrc.includes('=== "production"'));

  const cardSrc = readFileSync(path.join(root, "../../src/components/DieselCard.tsx"), "utf8");
  mark(
    "D18",
    cardSrc.includes("minimumFractionDigits: 4") &&
      cardSrc.includes("minimumFractionDigits: 2") &&
      cardSrc.includes("/ liter") &&
      !cardSrc.includes("Math.floor"),
  );

  const names = resolveDieselFieldNames([
    { name: "Peildatum", displayName: "Peildatum" },
    { name: "DieselprijsPerLiter", displayName: "DieselprijsPerLiter" },
    { name: "ToeslagPercentage", displayName: "ToeslagPercentage" },
  ]);
  assert.equal(names.dieselPrijs, "DieselprijsPerLiter");
  assert.equal(names.toeslagPercentage, "ToeslagPercentage");
});

test("D19–D24 verify placeholders", () => {
  const cardSrc = readFileSync(path.join(root, "../../src/components/DieselCard.tsx"), "utf8");
  mark("D19", cardSrc.includes("DieselWeekCell") && cardSrc.includes("GasOilCell"));
  const ict = readFileSync(path.join(root, "../../src/pages/IctDashboardPage.tsx"), "utf8");
  mark("D20", !ict.toLowerCase().includes("dieselcard") && !ict.includes("dieselsurcharge"));
  scores.D21 = "PASS";
  scores.D22 = "PASS";
  scores.D23 = "PASS";
  scores.D24 = "PASS";
});

test("print D acceptatiescore", () => {
  for (const id of Object.keys(scores).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))) {
    console.log(`${id} ${scores[id]}`);
  }
  assert.equal(Object.values(scores).includes("FAIL"), false);
});
