/**
 * Maxau forecast acceptatie M1–M34.
 * Machineleesbare HVZ-forecast ontbreekt → STOP; forecastcriteria NIET GETEST / M4 FAIL.
 * Geen fictieve forecast om criteria groen te maken.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const scores: Record<string, "PASS" | "FAIL" | "NIET GETEST"> = Object.fromEntries(
  Array.from({ length: 34 }, (_, i) => [`M${i + 1}`, "NIET GETEST"]),
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

async function get(url: string) {
  const response = await fetch(url, { method: "GET", redirect: "follow" });
  const bytes = new Uint8Array(await response.arrayBuffer());
  return { status: response.status, contentType: response.headers.get("content-type") ?? "", bytes };
}

test("M1–M34 Maxau forecast acceptatie (STOP zonder machineleesbare HVZ-forecast)", async () => {
  const hvzDataset = read("server/providers/hvzDataset.ts");
  const maxauProvider = read("server/providers/maxauProvider.ts");
  const maxauGraph = read("server/providers/maxauGraph.ts");
  const waterServiceFe = read("src/services/waterLevelService.ts");
  const waterChart = read("src/components/WaterChart.tsx");
  const waterCard = read("src/components/WaterLevelCard.tsx");
  const pegelonline = read("server/providers/pegelonline.ts");
  const docs = read("docs/MAXAU-FORECAST.md");
  const packageJson = read("package.json");

  mark("M1", hvzDataset.includes('STATION_ID = "09016"') && hvzDataset.includes("Maxau"));

  try {
    const { readMaxauFromHvz } = await import("./hvzDataset.js");
    const reading = await readMaxauFromHvz();
    mark("M2", Number.isFinite(reading.levelCm) && reading.levelCm > 0);
    mark("M3", typeof reading.updatedAt === "string" && /^\d{4}-\d{2}-\d{2}T/.test(reading.updatedAt));
  } catch (error) {
    console.log("HVZ actueel niet bereikbaar — M2/M3 NIET GETEST:", error);
    mark("M2", "NIET GETEST");
    mark("M3", "NIET GETEST");
  }

  let gifOk = false;
  try {
    const gif = await get("https://www.hvz.baden-wuerttemberg.de/gifs/09016-2001.GIF");
    const sig = String.fromCharCode(gif.bytes[0] ?? 0, gif.bytes[1] ?? 0, gif.bytes[2] ?? 0);
    gifOk = gif.status === 200 && sig === "GIF";
  } catch {
    gifOk = false;
  }

  const probedMissing = [
    "https://www.hvz.baden-wuerttemberg.de/js/dat-peg-vhs.js",
    "https://www.hvz.baden-wuerttemberg.de/data/vorhersage/09016.json",
    "https://www.pegelonline.wsv.de/webservices/rest-api/v2/stations/b6c6d5c8-e2d5-4469-8dd8-fa972ef7eaea/WV/measurements.json",
  ];
  const missingStatuses: number[] = [];
  for (const url of probedMissing) {
    try {
      missingStatuses.push((await get(url)).status);
    } catch {
      missingStatuses.push(0);
    }
  }

  const investigationComplete =
    gifOk &&
    missingStatuses.every((status) => status === 404 || status === 0) &&
    docs.includes("STOP") &&
    maxauGraph.includes("09016-2001.GIF");

  // M4 = "officiële forecastendpoint gevonden" → FAIL: alleen GIF, niet machineleesbaar
  if (!investigationComplete) {
    scores.M4 = "NIET GETEST";
  } else {
    scores.M4 = "FAIL";
  }

  for (const id of ["M5", "M6", "M7", "M8", "M9", "M10", "M11"] as const) {
    mark(id, "NIET GETEST");
  }

  mark(
    "M12",
    maxauProvider.includes("forecast: []") &&
      maxauProvider.includes("readMaxauFromHvz") &&
      maxauProvider.includes("forecastError: null"),
  );

  for (const id of ["M13", "M14", "M15"] as const) {
    mark(id, "NIET GETEST");
  }

  mark(
    "M16",
    !/hvz\.baden-wuerttemberg\.de/.test(waterServiceFe) &&
      waterServiceFe.includes("/api/waterlevels") &&
      !/pegelonline\.wsv\.de/.test(waterServiceFe),
  );

  for (const id of ["M17", "M18", "M19", "M20", "M21", "M22", "M23"] as const) {
    mark(id, "NIET GETEST");
  }

  mark(
    "M24",
    waterChart.includes("stroke-gold") &&
      waterChart.includes('point.kind === "verwacht"') &&
      waterCard.includes("dailyForecast"),
  );
  mark(
    "M25",
    pegelonline.includes("WV/measurements.json") &&
      read("server/providers/ruhrortProvider.ts").includes("DUISBURG-RUHRORT") &&
      read("server/providers/kaubProvider.ts").includes("KAUB"),
  );

  for (const id of ["M26", "M27", "M28", "M29"] as const) {
    mark(id, "NIET GETEST");
  }

  mark(
    "M30",
    maxauProvider.includes("forecast: []") &&
      (docs.includes("geen verzonnen") || docs.includes("geen OCR") || docs.includes("STOP")) &&
      !maxauProvider.includes("levelCm: 308") &&
      !maxauProvider.includes("levelCm: 310"),
  );

  // M31–M33: structureel + artifact na lokale build; M34 alleen PASS met echte HVZ-forecast in Docker
  mark("M31", packageJson.includes('"typecheck"'));
  mark("M32", packageJson.includes("maxauForecastAcceptance.test.ts"));
  try {
    mark("M33", readFileSync(path.join(root, "dist/server/index.js"), "utf8").length > 0);
  } catch {
    scores.M33 = "NIET GETEST";
  }
  // Geen machineleesbare Maxau-forecast → Docker-runtime forecastbewijs niet mogelijk
  scores.M34 = "NIET GETEST";

  console.log("MAXAU FORECAST ACCEPTANCE", JSON.stringify(scores, null, 2));
  assert.equal(scores.M1, "PASS");
  assert.equal(scores.M12, "PASS");
  assert.equal(scores.M16, "PASS");
  assert.equal(scores.M30, "PASS");
  assert.equal(scores.M32, "PASS");
});
