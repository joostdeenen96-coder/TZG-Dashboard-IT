import type { ShipPlanningEntry } from "../types/shipPlanning";

/** Plugin toont geplande_hoeveelheid als nl-NL getal met vaste suffix " t". Geen eenheid-attribuut. */
export function formatQuantity(entry: Pick<ShipPlanningEntry, "quantity" | "quantityUnit">) {
  if (entry.quantity == null) return null;
  const amount = entry.quantity.toLocaleString("nl-NL");
  if (entry.quantityUnit) return `${amount} ${entry.quantityUnit}`;
  return `${amount} t`;
}
