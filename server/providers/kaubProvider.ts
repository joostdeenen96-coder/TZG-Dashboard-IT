import { applyMeasuredStatus } from "../water/classifyWaterLevel.js";
import { readPegelonlineWater } from "./pegelonline.js";
import { failedStation, type WaterLevelProvider, type WaterStationResult } from "./waterLevelProvider.js";

const meta = {
  id: "kaub" as const,
  name: "Kaub",
  river: "Rijn",
  source: "PEGELONLINE",
};

export class KaubProvider implements WaterLevelProvider {
  async getCurrentData(): Promise<WaterStationResult> {
    try {
      const reading = await readPegelonlineWater({
        uuid: "1d26e504-7f9e-480a-b52c-5932be6549ab",
        shortname: "KAUB",
      });
      return { ...meta, ...applyMeasuredStatus("kaub", reading), error: null };
    } catch (error) {
      return failedStation(meta, error);
    }
  }
}
