import type { ShipPlanningEntry } from "../types/shipPlanning";

export const ROTATION_MS = 12_000;

export const PRIORITY_LOCATIONS = [
  { source: "HOOFDSTRAAT", label: "Hoofdstraat" },
  { source: "HOOGVELD(I)", label: "Hoogveld" },
  { source: "TEUNESEN OVERSLAG VENLO", label: "Venlo" },
  { source: "GVI CUIJK", label: "Cuijk" },
] as const;

export type LocationGroup = {
  location: string;
  label: string;
  entries: ShipPlanningEntry[];
};

export type LocationPage = LocationGroup & {
  pageInLocation: number;
};

export function locationLabel(source: string) {
  return PRIORITY_LOCATIONS.find((item) => item.source === source)?.label ?? source;
}

/** Prioriteitslaadplaatsen eerst, daarna overige groepen in bronvolgorde. Lege groepen vallen weg. */
export function orderLocationGroups(groups: { location: string; entries: ShipPlanningEntry[] }[]): LocationGroup[] {
  const byName = new Map(groups.filter((group) => group.entries.length > 0).map((group) => [group.location, group]));
  const ordered: LocationGroup[] = [];
  const used = new Set<string>();
  for (const priority of PRIORITY_LOCATIONS) {
    const group = byName.get(priority.source);
    if (!group) continue;
    ordered.push({ location: group.location, label: priority.label, entries: group.entries });
    used.add(priority.source);
  }
  for (const group of groups) {
    if (!group.entries.length || used.has(group.location)) continue;
    ordered.push({ location: group.location, label: locationLabel(group.location), entries: group.entries });
    used.add(group.location);
  }
  return ordered;
}

export function rowsPerPage(listHeight: number, rowHeight = 44) {
  if (!Number.isFinite(listHeight) || listHeight < rowHeight) return 1;
  return Math.max(1, Math.floor(listHeight / rowHeight));
}

export function buildLocationPages(groups: { location: string; entries: ShipPlanningEntry[] }[], pageSize: number): LocationPage[] {
  const size = Math.max(1, pageSize);
  const pages: LocationPage[] = [];
  for (const group of orderLocationGroups(groups)) {
    for (let index = 0; index < group.entries.length; index += size) {
      pages.push({
        location: group.location,
        label: group.label,
        entries: group.entries.slice(index, index + size),
        pageInLocation: Math.floor(index / size),
      });
    }
  }
  return pages;
}

/** Houdt de huidige pagina als die nog bestaat. Een verdwenen laadplaats schuift niet terug naar het begin. */
export function nextRotationIndex(current: number, previousPages: LocationPage[], nextPages: LocationPage[]) {
  if (nextPages.length === 0) return 0;
  const page = previousPages[current];
  if (!page) return Math.min(Math.max(current, 0), nextPages.length - 1);
  const same = nextPages.findIndex(
    (candidate) => candidate.location === page.location && candidate.pageInLocation === page.pageInLocation,
  );
  if (same >= 0) return same;
  return Math.min(current, nextPages.length - 1);
}
