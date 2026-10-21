import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  INTERRIJN_PARSER_VALIDATED,
  INTERRIJN_SOURCE_ID,
  INTERRIJN_SOURCE_LABEL,
  INTERRIJN_URL,
  NetherlandsInterrijnGasOilProvider,
  isNonProductInterrijnHtml,
  parseInterrijnHtml,
} from "./netherlandsInterrijnGasOilProvider.js";

const fixtureDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../fixtures");
const welcomeHtml = readFileSync(path.join(fixtureDir, "interrijn-domain-welcome.html"), "utf8");

test("NL parser is niet gevalideerd zolang echte Interrijn-output ontbreekt (NL7)", () => {
  assert.equal(INTERRIJN_PARSER_VALIDATED, false);
});

test("source ids en labels", () => {
  const provider = new NetherlandsInterrijnGasOilProvider({
    fetchText: async () => {
      throw new Error("niet aanroepen");
    },
  });
  assert.equal(provider.sourceId, INTERRIJN_SOURCE_ID);
  assert.equal(provider.sourceLabel, INTERRIJN_SOURCE_LABEL);
  assert.equal(INTERRIJN_URL, "https://www.interrijn.com/nl/");
});

test("welcome/parking HTML wordt herkend", () => {
  assert.equal(isNonProductInterrijnHtml(welcomeHtml), true);
  assert.equal(isNonProductInterrijnHtml("<html><body>echte site zonder welcome</body></html>"), false);
});

test("parseInterrijnHtml faalt dicht zolang niet gevalideerd — ook met eurobedragen op pagina", () => {
  const outcome = parseInterrijnHtml(welcomeHtml);
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.match(outcome.reason, /niet gevalideerd|NL7/i);
});

test("Interrijn onbereikbaar -> unavailable outcome", async () => {
  const provider = new NetherlandsInterrijnGasOilProvider({
    fetchText: async () => {
      throw new Error("Bron niet bereikbaar.");
    },
  });
  const outcome = await provider.getCurrentObservation();
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.match(outcome.reason, /niet bereikbaar/i);
});

test("Interrijn welcome page -> unavailable, geen prijs", async () => {
  const provider = new NetherlandsInterrijnGasOilProvider({
    fetchText: async () => welcomeHtml,
  });
  const outcome = await provider.getCurrentObservation();
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.match(outcome.reason, /welcome|parking|niet gevalideerd/i);
});

test("HTML zonder welcome maar zonder gevalideerde parser -> unavailable", async () => {
  const provider = new NetherlandsInterrijnGasOilProvider({
    fetchText: async () =>
      "<html><body><p>Gasolieprijs CBRB € 1.642,60 per 1000 liter ex BTW</p></body></html>",
  });
  const outcome = await provider.getCurrentObservation();
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.match(outcome.reason, /niet gevalideerd/i);
});
