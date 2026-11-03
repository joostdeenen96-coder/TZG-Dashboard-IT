/** Eindige geplande hoeveelheden. Ontbrekend of ongeldig telt niet mee en wordt geen nul. */
export function finiteQuantities(quantities: readonly (number | null | undefined)[]) {
  return quantities.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
}

function fractionDigitsOf(value: number) {
  if (Number.isInteger(value)) return 0;
  const text = value.toString();
  if (/e/i.test(text)) return 3;
  const fraction = text.split(".")[1];
  return fraction ? Math.min(fraction.length, 3) : 0;
}

function roundTo(value: number, digits: number) {
  if (digits <= 0) return value;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export type LocationQuantity = {
  /** null wanneer geen enkele hoeveelheid bekend is. */
  total: number | null;
  fractionDigits: number;
};

export function locationQuantity(quantities: readonly (number | null | undefined)[]): LocationQuantity {
  const values = finiteQuantities(quantities);
  if (values.length === 0) return { total: null, fractionDigits: 0 };
  const fractionDigits = values.reduce((max, value) => Math.max(max, fractionDigitsOf(value)), 0);
  const raw = values.reduce((sum, value) => sum + value, 0);
  return { total: fractionDigits === 0 ? raw : roundTo(raw, fractionDigits), fractionDigits };
}

export function formatShipCount(count: number) {
  return count === 1 ? "1 schip" : `${count} schepen`;
}

export function formatTons(total: number, fractionDigits: number) {
  const amount = total.toLocaleString("nl-NL", {
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
  });
  return `${amount} ton`;
}

/** Eén regel voor de laadplaatsheader: aantal schepen en het totaal van de hele laadplaats. */
export function formatShipLocationMeta(count: number, quantity: LocationQuantity) {
  const ships = formatShipCount(count);
  if (quantity.total == null) return `${ships} · Tonnage niet beschikbaar`;
  return `${ships} · ${formatTons(quantity.total, quantity.fractionDigits)}`;
}
