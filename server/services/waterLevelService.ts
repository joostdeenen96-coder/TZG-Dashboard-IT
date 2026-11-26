import { logWarn } from "../log.js";
import { KaubProvider } from "../providers/kaubProvider.js";
import { MaxauProvider } from "../providers/maxauProvider.js";
import { RuhrortProvider } from "../providers/ruhrortProvider.js";
import {
  failedStation,
  type WaterLevelProvider,
  type WaterLevelsResponse,
  type WaterStationId,
} from "../providers/waterLevelProvider.js";

const stationMeta = {
  kaub: { id: "kaub", name: "Kaub", river: "Rijn", source: "PEGELONLINE" },
  ruhrort: { id: "ruhrort", name: "Ruhrort", river: "Rijn", source: "PEGELONLINE" },
  maxau: { id: "maxau", name: "Maxau", river: "Rijn", source: "HVZ Baden-Württemberg" },
} as const;

const providers: Record<WaterStationId, WaterLevelProvider> = {
  kaub: new KaubProvider(),
  ruhrort: new RuhrortProvider(),
  maxau: new MaxauProvider(),
};

export async function getWaterLevels(
  overrides?: Partial<Record<WaterStationId, WaterLevelProvider>>,
): Promise<WaterLevelsResponse> {
  const active = { ...providers, ...overrides };
  const ids = Object.keys(active) as WaterStationId[];
  const entries = await Promise.all(
    ids.map(async (id) => {
      try {
        return [id, await active[id].getCurrentData()] as const;
      } catch (error) {
        const message = error instanceof Error && error.message ? error.message : "Bron niet bereikbaar.";
        logWarn(`waterstand ${id} mislukt: ${message}`, { event: "water.station.failed", station: id });
        return [id, failedStation(stationMeta[id], error)] as const;
      }
    }),
  );
  return Object.fromEntries(entries) as WaterLevelsResponse;
}
