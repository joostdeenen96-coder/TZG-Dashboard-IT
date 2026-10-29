import { applyMeasuredStatus } from "../water/classifyWaterLevel.js";
import { readPegelonlineWater } from "./pegelonline.js";
import { failedStation, type WaterLevelProvider, type WaterStationResult } from "./waterLevelProvider.js";

const meta = {
  id: "ruhrort" as const,
  name: "Ruhrort",
  river: "Rijn",
  source: "PEGELONLINE",
};

export class RuhrortProvider implements WaterLevelProvider {
  async getCurrentData(): Promise<WaterStationResult> {
    try {
      const reading = await readPegelonlineWater({
        uuid: "c0f51e35-d0e8-4318-afaf-c5fcbc29f4c1",
        shortname: "DUISBURG-RUHRORT",
      });
      return { ...meta, ...applyMeasuredStatus("ruhrort", reading), error: null };
    } catch (error) {
      return failedStation(meta, error);
    }
  }
}
