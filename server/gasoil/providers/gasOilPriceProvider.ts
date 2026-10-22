import type { GasOilPriceObservation } from "../model.js";

export type GasOilFetchOutcome =
  | { ok: true; observation: GasOilPriceObservation }
  | { ok: false; reason: string };

export interface GasOilPriceProvider {
  readonly country: "NL" | "BE";
  readonly sourceId: string;
  readonly sourceLabel: string;
  getCurrentObservation(): Promise<GasOilFetchOutcome>;
}
