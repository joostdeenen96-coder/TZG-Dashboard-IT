import type { DieselSurcharge, DieselSurchargeProvider } from "./dieselSurchargeProvider.js";

/** Fallback wanneer SharePoint/Graph niet bereikbaar is — bevat huidige + vorige week. */
const currentWeek = {
  peildatum: "2026-10-13",
  dieselPrijs: 0,
  toeslagPercentage: 12.4,
  actief: true,
};

const previousWeek = {
  peildatum: "2026-10-06",
  dieselPrijs: 0,
  toeslagPercentage: 11.9,
  actief: false,
};

const fallbackSurcharge: DieselSurcharge = {
  ...currentWeek,
  weken: [previousWeek, currentWeek],
};

export class MockDieselProvider implements DieselSurchargeProvider {
  getCurrentData(): Promise<DieselSurcharge> {
    return Promise.resolve(fallbackSurcharge);
  }
}
