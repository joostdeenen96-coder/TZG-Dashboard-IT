import type { DieselSurcharge, DieselSurchargeProvider } from "./dieselSurchargeProvider.js";

/**
 * Alleen development-fallback wanneer Graph ontbreekt en NODE_ENV !== production.
 * Geen productiebron — placeholders, geen acceptatiewaarden.
 */
const latest = {
  itemId: "mock-latest",
  peildatum: "2026-01-06",
  isoWeek: 2,
  dieselPrijs: 1.2345,
  toeslagPercentage: 10.12,
  actief: false,
};

const previous = {
  itemId: "mock-previous",
  peildatum: "2025-12-30",
  isoWeek: 1,
  dieselPrijs: 1.1111,
  toeslagPercentage: 9.99,
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
