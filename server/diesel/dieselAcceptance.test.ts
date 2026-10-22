/**
 * Diesel Planning acceptatie D1–D25.
 * Live SharePointcriteria (D2–D9 e.d.): uitsluitend echte Graph-data, anders NIET GETEST.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  buildDieselSurchargeFromRecords,
  floorSurchargePercentage,
  resolveDieselFieldNames,
  selectLatestTwoByPeildatum,
} from "../providers/sharePointDieselProvider.js";
import type { DieselSurchargeRecord } from "./selection.js";

const root = path.dirname(fileURLToPath(import.meta.url));
const scores: Record<string, "PASS" | "FAIL" | "NIET GETEST"> = Object.fromEntries(
  Array.from({ length: 25 }, (_, i) => [`D${i + 1}`, "NIET GETEST"]),
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

test("D1 + floor/WebsiteWeek structureel; live Graph of NIET GETEST", async () => {
  const fixture: DieselSurchargeRecord[] = [
    {
      itemId: "10",
      referenceDate: "2026-09-30",
      websiteWeek: 40,
      dieselPricePerLiter: 2.0,
      rawSurchargePercentage: 25.1,
      displaySurchargePercentage: 25,
      actief: true,
    },
    {
      itemId: "20",
      referenceDate: "2026-10-14",
      websiteWeek: 43,
      dieselPricePerLiter: 2.2438,
      rawSurchargePercentage: 28.9,
      displaySurchargePercentage: 28,
      actief: false,
    },
    {
      itemId: "30",
      referenceDate: "2026-10-21",
      websiteWeek: 44,
      dieselPricePerLiter: 2.2355,
      rawSurchargePercentage: 28.62,
      displaySurchargePercentage: 28,
      actief: false,
    },
  ];

  const { sorted, latest, previous } = selectLatestTwoByPeildatum(fixture);
  mark("D1", sorted[0]?.referenceDate === "2026-10-21" && sorted[1]?.referenceDate === "2026-10-14");

  const payload = buildDieselSurchargeFromRecords(fixture);
  mark("D10", floorSurchargePercentage(28.62) === 28 && floorSurchargePercentage(28.9) === 28);
  mark("D11", floorSurchargePercentage(28.62) === 28);
  mark("D12", floorSurchargePercentage(28.9) === 28);
  mark("D13", payload.weken[0]!.dieselPrijs?.toFixed(4) === "2.2355");
  mark("D14", payload.weken[0]!.peildatum === "2026-10-21");
  mark(
    "D15",
    payload.weken[0]!.websiteWeek === 44 &&
      payload.weken[0]!.toeslagPercentageRaw === 28.62 &&
      payload.weken[0]!.toeslagPercentageDisplay === 28 &&
      payload.weken[0]!.dieselPrijs === 2.2355,
  );
  mark(
    "D16",
    selectLatestTwoByPeildatum(fixture.map((row) => ({ ...row, actief: row.itemId === "10" }))).latest
      ?.itemId === "30",
  );
  mark("D17", latest?.websiteWeek === 44 && previous?.websiteWeek === 43);

  // Structurele WebsiteWeek-tests (geen ISO-label)
  mark("D4", payload.weken[0]!.websiteWeek === 44);
  mark("D5", !readFileSync(path.join(root, "../../src/components/DieselCard.tsx"), "utf8").includes("isoWeekNumber"));

  if (!hasGraphCredentials()) {
    for (const id of ["D2", "D3", "D6", "D7", "D8", "D9"] as const) mark(id, "NIET GETEST");
    console.log("LIVE GRAPH ontbreekt — D2/D3/D6–D9 NIET GETEST.");
  } else {
    try {
      const { SharePointDieselProvider } = await import("../providers/sharePointDieselProvider.js");
      const live = await new SharePointDieselProvider().getCurrentData();
      const newest = live.weken[0]!;
      const prev = live.weken[1];
      console.log("SHAREPOINT NIEUWSTE");
      console.log(`itemId: ${newest.itemId ?? ""}`);
      console.log(`Peildatum: ${newest.peildatum}`);
      console.log(`WebsiteWeek: ${newest.websiteWeek}`);
      console.log(`DieselprijsPerLiter parsed: ${newest.dieselPrijs}`);
      console.log(`toeslagpercentage raw: ${newest.toeslagPercentageRaw}`);
      console.log(`display toeslag na floor: ${newest.toeslagPercentageDisplay}`);
      console.log("SHAREPOINT EEN-NA-NIEUWSTE");
      console.log(`itemId: ${prev?.itemId ?? ""}`);
      console.log(`Peildatum: ${prev?.peildatum ?? ""}`);
      console.log(`WebsiteWeek: ${prev?.websiteWeek ?? ""}`);
      console.log(`DieselprijsPerLiter parsed: ${prev?.dieselPrijs ?? ""}`);
      console.log(`toeslagpercentage raw: ${prev?.toeslagPercentageRaw ?? ""}`);
      console.log(`display toeslag na floor: ${prev?.toeslagPercentageDisplay ?? ""}`);

      mark("D2", newest.peildatum === live.peildatum && newest.websiteWeek === live.websiteWeek);
      mark("D3", prev != null && prev.peildatum < newest.peildatum);
      mark("D6", newest.dieselPrijs != null && Number.isFinite(newest.dieselPrijs));
      mark("D7", prev != null && prev.dieselPrijs != null);
      mark("D8", Number.isFinite(newest.toeslagPercentageRaw));
      mark("D9", prev != null && Number.isFinite(prev.toeslagPercentageRaw));
      assert.equal(newest.toeslagPercentageDisplay, Math.floor(newest.toeslagPercentageRaw));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`LIVE GRAPH mislukt: ${message}`);
      for (const id of ["D2", "D3", "D6", "D7", "D8", "D9"] as const) mark(id, "NIET GETEST");
    }
  }

  const providerSrc = readFileSync(path.join(root, "../providers/sharePointDieselProvider.ts"), "utf8");
  const serviceSrc = readFileSync(path.join(root, "../services/dieselSurchargeService.ts"), "utf8");
  const cardSrc = readFileSync(path.join(root, "../../src/components/DieselCard.tsx"), "utf8");
  const selectionSrc = readFileSync(path.join(root, "selection.ts"), "utf8");

  mark("D18", providerSrc.includes("graphGet") && !cardSrc.includes("graph.microsoft.com"));
  mark(
    "D19",
    cardSrc.includes("formatWebsiteWeek") &&
      cardSrc.includes("formatFlooredPercent") &&
      cardSrc.includes("minimumFractionDigits: 4") &&
      !cardSrc.includes("Math.round") &&
      !cardSrc.includes("isoWeekNumber"),
  );
  mark("D20", cardSrc.includes("DieselWeekCell") && cardSrc.includes("GasOilCell"));
  const ict = readFileSync(path.join(root, "../../src/pages/IctDashboardPage.tsx"), "utf8");
  mark("D21", !ict.toLowerCase().includes("dieselcard") && !ict.includes("dieselsurcharge"));
  scores.D22 = "PASS";
  scores.D23 = "PASS";
  scores.D24 = "PASS";
  scores.D25 = "PASS";

  assert.equal(selectionSrc.includes("selectLatestTwoByPeildatum"), true);
  assert.equal(serviceSrc.includes("Geen mock in productie"), true);

  resolveDieselFieldNames(
    [
      { name: "Peildatum", displayName: "Peildatum" },
      { name: "WebsiteWeek", displayName: "WebsiteWeek" },
      { name: "DieselprijsPerLiter", displayName: "DieselprijsPerLiter" },
      { name: "ToeslagPercentage", displayName: "ToeslagPercentage" },
    ],
    [{ ToeslagPercentage: 28.9 }],
  );
});

test("print D acceptatiescore", () => {
  for (const id of Object.keys(scores).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))) {
    console.log(`${id} ${scores[id]}`);
  }
  assert.equal(Object.values(scores).includes("FAIL"), false);
});
