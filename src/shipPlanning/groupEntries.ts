import type { ShipPlanningEntry } from "../types/shipPlanning";

/** Groepeert op laadplaats in bronvolgorde. Geen alfabetische hersortering. */
export function groupEntries(entries: ShipPlanningEntry[]) {
  const groups: { location: string; entries: ShipPlanningEntry[] }[] = [];
  const index = new Map<string, number>();
  for (const entry of entries) {
    const location = entry.loadingLocation?.trim() || "Onbekende laadplaats";
    const at = index.get(location);
    if (at == null) {
      index.set(location, groups.length);
      groups.push({ location, entries: [entry] });
    } else {
      groups[at]?.entries.push(entry);
    }
  }
  return groups;
}
