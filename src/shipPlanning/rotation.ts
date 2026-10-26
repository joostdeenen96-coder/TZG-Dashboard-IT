import { amsterdamYmdFromEpoch } from "./amsterdamDate";
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

function loadingInstant(entry: ShipPlanningEntry) {
  return typeof entry.loadingAt === "number" && Number.isFinite(entry.loadingAt) ? entry.loadingAt : null;
}

/**
 * Zichtbare lading van de gekozen dag.
 * Alleen een laaddatum op die kalenderdag blijft staan.
 * Een rit die alleen via losdatum in de bronquery zit, of zonder laaddatum, hoort er niet bij.
 */
export function entriesForDisplayedLoadDay(entries: ShipPlanningEntry[], day: string) {
  return entries.filter((entry) => {
    if (typeof entry.loadingAt !== "number" || !Number.isFinite(entry.loadingAt)) return false;
    return amsterdamYmdFromEpoch(entry.loadingAt) === day;
  });
}

/**
 * Eerst op laaddatum, daarna op oorspronkelijke bronvolgorde.
 * Ontbrekende of ongeldige tijden blijven achteraan, in bronvolgorde.
 */
export function sortEntriesChronologically(entries: ShipPlanningEntry[]) {
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((left, right) => {
      const leftAt = loadingInstant(left.entry);
      const rightAt = loadingInstant(right.entry);
      if (leftAt != null && rightAt != null && leftAt !== rightAt) return leftAt - rightAt;
      if (leftAt != null && rightAt == null) return -1;
      if (leftAt == null && rightAt != null) return 1;
      const leftOrder = left.entry.sourceOrder;
      const rightOrder = right.entry.sourceOrder;
      if (leftOrder != null && rightOrder != null && leftOrder !== rightOrder) return leftOrder - rightOrder;
      if (leftOrder != null && rightOrder == null) return -1;
      if (leftOrder == null && rightOrder != null) return 1;
      return left.index - right.index;
    })
    .map((row) => row.entry);
}

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
    const sorted = sortEntriesChronologically(group.entries);
    const locationCount = sorted.length;
    const locationPageCount = Math.ceil(locationCount / pageCapacity);
    for (let pageInLocation = 0; pageInLocation < locationPageCount; pageInLocation += 1) {
      const start = pageInLocation * pageCapacity;
      const slice = sorted.slice(start, start + pageCapacity);
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

function pageIndex(
  pages: LocationPage[],
  location: string,
  pageInLocation: number | null,
) {
  if (pageInLocation != null) {
    const exact = pages.findIndex(
      (candidate) => candidate.location === location && candidate.pageInLocation === pageInLocation,
    );
    if (exact >= 0) return exact;
  }
  const sameLocation = pages
    .map((candidate, index) => ({ candidate, index }))
    .filter((row) => row.candidate.location === location);
  if (sameLocation.length === 0) return -1;
  if (pageInLocation == null) return sameLocation[0]?.index ?? -1;
  const notAfter = sameLocation.filter((row) => row.candidate.pageInLocation <= pageInLocation);
  return (notAfter.at(-1) ?? sameLocation[0]).index;
}

/**
 * Houdt de actieve laadplaats/pagina vast na een datarefresh.
 * Is de pagina weg maar de laadplaats niet, dan blijft die laadplaats.
 * Is de laadplaats weg, dan volgt de eerstvolgende state. Nooit een sprong terug naar het begin
 * zolang er nog een latere state bestaat.
 */
export function nextRotationIndex(current: number, previousPages: LocationPage[], nextPages: LocationPage[]) {
  if (nextPages.length === 0) return 0;
  const page = previousPages[current];
  if (!page) return Math.min(Math.max(current, 0), nextPages.length - 1);
  const exact = pageIndex(nextPages, page.location, page.pageInLocation);
  if (exact >= 0) return exact;
  for (let cursor = current + 1; cursor < previousPages.length; cursor += 1) {
    const candidate = previousPages[cursor];
    if (!candidate) continue;
    const found = pageIndex(nextPages, candidate.location, candidate.pageInLocation);
    if (found >= 0) return found;
  }
  return 0;
}

/** Handmatige stap. Eerste + links en laatste + rechts lopen rond. */
export function stepLocationIndex(current: number, count: number, delta: number) {
  if (count <= 0) return 0;
  const base = ((current % count) + count) % count;
  return (base + delta + count) % count;
}
