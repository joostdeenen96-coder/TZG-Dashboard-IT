/**
 * Schepenplanning acceptatie SP1–SP40.
 * STOP zonder dedicated serviceaccount: live auth/data = NIET GETEST.
 * Geen credentials of fictieve scheepsregels in dit bestand.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const scores: Record<string, "PASS" | "FAIL" | "NIET GETEST"> = Object.fromEntries(
  Array.from({ length: 40 }, (_, i) => [`SP${i + 1}`, "NIET GETEST"]),
) as Record<string, "PASS" | "FAIL" | "NIET GETEST">;

function mark(id: keyof typeof scores, ok: boolean | "NIET GETEST") {
  if (ok === "NIET GETEST") {
    scores[id] = "NIET GETEST";
    return;
  }
  scores[id] = ok ? "PASS" : "FAIL";
  if (ok !== true) assert.fail(`${id} failed`);
}

function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

function hasLiveShipPlanningSecrets() {
  return Boolean(
    process.env.SHIP_PLANNING_USERNAME?.trim() &&
      (process.env.SHIP_PLANNING_PASSWORD?.trim() || process.env.SHIP_PLANNING_API_KEY?.trim()),
  );
}

test("SP1–SP40 schepenplanning acceptatie (STOP zonder serviceaccount)", async () => {
  const docs = read("docs/SCHEPENPLANNING.md");
  const packageJson = read("package.json");
  const frontendWater = read("src/services/waterLevelService.ts");
  const dashboardService = read("src/services/dashboardService.ts");

  mark("SP7", docs.includes("Ontbrekende technische toegang") && docs.includes("Dedicated serviceaccount"));
  mark(
    "SP8",
    !docs.includes("SHIP_PLANNING_PASSWORD=") &&
      (docs.includes("geen credentials in rapport") ||
        docs.includes("geen credentials/tokens/username in logs of rapport")) &&
      docs.includes("STOP"),
  );
  mark("SP9", !frontendWater.includes("planning.teunesen.nl") && !dashboardService.includes("planning.teunesen.nl"));
  mark("SP13", docs.includes("Europe/Amsterdam"));

  try {
    const response = await fetch("https://planning.teunesen.nl/api/user-access/application/fromDomain", {
      method: "GET",
      redirect: "follow",
    });
    const body = (await response.json()) as { domainName?: string; primaryTimeZone?: string };
    // SP5 = "planningpagina niet bereikbaar" — hier omgekeerd: bereikbaarheid van tenantmeta
    // Markeer als structureel bewijs dat de host/API bereikbaar is; echte SP5-foutpad blijft NIET GETEST.
    mark(
      "SP5",
      "NIET GETEST",
    );
    assert.equal(response.status, 200);
    assert.equal(body.domainName, "planning.teunesen.nl");
    assert.equal(body.primaryTimeZone, "Europe/Amsterdam");
  } catch (error) {
    console.log("fromDomain niet bereikbaar:", error);
    mark("SP5", "NIET GETEST");
  }

  try {
    const response = await fetch("https://planning.teunesen.nl/api/user-access/authenticate", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ username: "x", password: "y" }),
    });
    const text = await response.text();
    mark(
      "SP2",
      response.status === 400 && text.includes("auth.invalidcredentials") && !/stack/i.test(text),
    );
    mark("SP10", !text.includes("Bearer") && !/"token"\s*:/.test(text));
  } catch {
    mark("SP2", "NIET GETEST");
    mark("SP10", "NIET GETEST");
  }

  if (!hasLiveShipPlanningSecrets()) {
    console.log("LIVE SHIP PLANNING secrets ontbreken — SP1/SP3/SP4/SP6/SP11–SP40 NIET GETEST.");
  }

  assert.ok(docs.includes("/api/user-access/authenticate"));
  assert.ok(docs.includes("/api/data/v2/"));
  assert.ok(packageJson.includes("shipPlanningAcceptance.test.ts"));

  console.log("SHIP PLANNING ACCEPTANCE", JSON.stringify(scores, null, 2));
  assert.equal(scores.SP2, "PASS");
  assert.equal(scores.SP7, "PASS");
  assert.equal(scores.SP8, "PASS");
  assert.equal(scores.SP9, "PASS");
  assert.equal(scores.SP10, "PASS");
  assert.equal(scores.SP13, "PASS");
});
