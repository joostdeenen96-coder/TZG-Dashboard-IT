import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/**
 * HVZ publiceert de Maxau-Vorhersage alleen als GIF (09016-2001.GIF, 800×600).
 * Het bestand bevat geen commentaar, aslabels of schaal. De pagina kan de grafiek zoomen
 * zonder metadata. Pixelconversie zou een visuele schatting zijn.
 */
test("M1-M10 Maxau-forecast blijft leeg: grafiek is niet betrouwbaar machineleesbaar", () => {
  const graph = readFileSync(new URL("./maxauGraph.ts", import.meta.url), "utf8");
  const provider = readFileSync(new URL("./maxauProvider.ts", import.meta.url), "utf8");
  assert.match(graph, /https:\/\/www\.hvz\.baden-wuerttemberg\.de\/gifs\/09016-2001\.GIF/);
  assert.equal(/waterLevelCm|forecastAt|parseGif|pixel/.test(graph), false);
  assert.match(provider, /forecast: \[\]/);
  assert.equal(provider.includes("readMaxauForecastGraph"), false);
  assert.match(provider, /HVZ Baden-Württemberg/);
});
