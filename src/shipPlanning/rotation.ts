import type { ShipPlanningEntry } from "../types/shipPlanning";

export const ROTATION_MS = 12_000;

/** Vaste grens: tot en met 6 schepen één tabel, daarboven twee tabellen van maximaal 6. */
export const SHIPS_PER_COLUMN = 6;

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
  locationPageCount: number;
  locationCount: number;
  columns: 1 | 2;
  left: ShipPlanningEntry[];
  right: ShipPlanningEntry[];
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

/** Rijen die veilig in één kolomblok passen. */
export function rowsPerColumn(listHeight: number, rowHeight = 32) {
  if (!Number.isFinite(listHeight) || listHeight < rowHeight) return 1;
  return Math.max(1, Math.floor(listHeight / rowHeight));
}

export const rowsPerPage = rowsPerColumn;

/** Links eerst vullen tot de kolomgrens, daarna rechts. Geen oneven/even. */
export function splitSequential(entries: ShipPlanningEntry[], perColumn: number) {
  const size = Math.max(1, perColumn);
  if (entries.length <= size) return { columns: 1 as const, left: entries, right: [] as ShipPlanningEntry[] };
  return { columns: 2 as const, left: entries.slice(0, size), right: entries.slice(size) };
}

export function buildLocationPages(
  groups: { location: string; entries: ShipPlanningEntry[] }[],
  perColumn: number,
): LocationPage[] {
  const columnSize = Math.max(1, perColumn);
  const pageCapacity = columnSize * 2;
  const pages: LocationPage[] = [];
  for (const group of orderLocationGroups(groups)) {
    const locationCount = group.entries.length;
    const locationPageCount = Math.ceil(locationCount / pageCapacity);
    for (let pageInLocation = 0; pageInLocation < locationPageCount; pageInLocation += 1) {
      const start = pageInLocation * pageCapacity;
      const slice = group.entries.slice(start, start + pageCapacity);
      const split = splitSequential(slice, columnSize);
      pages.push({
        location: group.location,
        label: group.label,
        entries: slice,
        pageInLocation,
        locationPageCount,
        locationCount,
        columns: split.columns,
        left: split.left,
        right: split.right,
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
