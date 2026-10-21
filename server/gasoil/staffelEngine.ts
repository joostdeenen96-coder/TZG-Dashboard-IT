import type { GasOilCountry, StaffelRange } from "./model.js";

/** Decimal-safe money: work in eurocents (integer). */

function toCents(amount: number) {
  if (!Number.isFinite(amount)) throw new Error("Bedrag is geen getal.");
  return Math.round(amount * 100);
}

function fromCents(cents: number) {
  return cents / 100;
}

/**
 * NL staffel: onder €700 geen toeslag; vanaf €700 stappen van €25 → +€0,05.
 * surcharge = 0.05 * (floor((price - 700) / 25) + 1)
 */
export function calculateNetherlandsSurcharge(priceExVatPer1000Liters: number): number {
  const priceCents = toCents(priceExVatPer1000Liters);
  const threshold = 70_000;
  if (priceCents < threshold) return 0;
  const step = 2_500;
  const band = Math.floor((priceCents - threshold) / step);
  const surchargeCents = 5 * (band + 1);
  return fromCents(surchargeCents);
}

/**
 * BE staffel: onder €500 geen toeslag; vanaf €500 stappen van €25 → +€0,03.
 * surcharge = 0.03 * (floor((price - 500) / 25) + 1)
 */
export function calculateBelgiumSurcharge(priceExVatPer1000Liters: number): number {
  const priceCents = toCents(priceExVatPer1000Liters);
  const threshold = 50_000;
  if (priceCents < threshold) return 0;
  const step = 2_500;
  const band = Math.floor((priceCents - threshold) / step);
  const surchargeCents = 3 * (band + 1);
  return fromCents(surchargeCents);
}

export function calculateSurcharge(country: GasOilCountry, priceExVatPer1000Liters: number): number {
  return country === "NL"
    ? calculateNetherlandsSurcharge(priceExVatPer1000Liters)
    : calculateBelgiumSurcharge(priceExVatPer1000Liters);
}

export function staffelRangeFor(country: GasOilCountry, priceExVatPer1000Liters: number): StaffelRange | null {
  const priceCents = toCents(priceExVatPer1000Liters);
  const threshold = country === "NL" ? 70_000 : 50_000;
  const step = 2_500;
  if (priceCents < threshold) return null;
  const band = Math.floor((priceCents - threshold) / step);
  const fromCentsValue = threshold + band * step;
  const toCentsValue = fromCentsValue + step - 1;
  return {
    from: fromCents(fromCentsValue),
    to: fromCents(toCentsValue),
  };
}
