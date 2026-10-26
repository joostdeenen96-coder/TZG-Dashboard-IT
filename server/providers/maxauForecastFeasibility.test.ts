import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("M12 Maxau-provider leest de HVZ-GIF niet uit", () => {
  const graph = readFileSync(new URL("./maxauGraph.ts", import.meta.url), "utf8");
  const provider = readFileSync(new URL("./maxauProvider.ts", import.meta.url), "utf8");
  const forecast = readFileSync(new URL("./rlpMaxauForecast.ts", import.meta.url), "utf8");
  assert.match(graph, /https:\/\/www\.hvz\.baden-wuerttemberg\.de\/gifs\/09016-2001\.GIF/);
  assert.equal(/waterLevelCm|forecastAt|parseGif|pixel/.test(graph), false);
  assert.equal(provider.includes("readMaxauForecastGraph"), false);
  assert.equal(forecast.includes("readMaxauForecastGraph"), false);
  assert.equal(/parseGif|getImageData|ocr|pixel/i.test(`${provider}\n${forecast}`), false);
  assert.match(forecast, /https:\/\/www\.hochwasser\.rlp\.de\/api\/v1\/measurement-site\/23700200/);
  assert.match(provider, /HVZ Baden-Württemberg/);
});
