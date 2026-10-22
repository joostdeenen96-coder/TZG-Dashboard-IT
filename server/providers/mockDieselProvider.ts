import type { DieselSurcharge, DieselSurchargeProvider } from "./dieselSurchargeProvider.js";

/**
 * Alleen development-fallback wanneer Graph ontbreekt en NODE_ENV !== production.
 * Geen productiebron — placeholders, geen acceptatiewaarden.
 */
const latest = {
  itemId: "mock-latest",
  peildatum: "2026-01-06",
  websiteWeek: 2,
  dieselPrijs: 1.2345,
  toeslagPercentage: 10,
  toeslagPercentageRaw: 10.12,
  toeslagPercentageDisplay: 10,
  actief: false,
};

const previous = {
  itemId: "mock-previous",
  peildatum: "2025-12-30",
  websiteWeek: 1,
  dieselPrijs: 1.1111,
  toeslagPercentage: 9,
  toeslagPercentageRaw: 9.99,
  toeslagPercentageDisplay: 9,
  actief: false,
};

const fallbackSurcharge: DieselSurcharge = {
  ...latest,
  weken: [latest, previous],
};

export class MockDieselProvider implements DieselSurchargeProvider {
  getCurrentData(): Promise<DieselSurcharge> {
    return Promise.resolve(fallbackSurcharge);
  }
}
