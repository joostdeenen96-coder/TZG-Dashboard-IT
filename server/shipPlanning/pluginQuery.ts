/**
 * Requeststructuur uit de reeds geanalyseerde plugin PlanningScreen.
 * entityTypeId 255 → POST /api/data/255/query (numeriek pad, geen v2).
 * Filtergrammatica = Tarasa DataFilter: JSON.stringify op waarden, AND/OR zoals de plugin.
 */

/** Bewezen entity type van de schepenplanning (constants-export c → 255). */
export const SHIP_PLANNING_ENTITY_TYPE_ID = 255;

export const SHIP_PLANNING_QUERY_PATH = `/api/data/${SHIP_PLANNING_ENTITY_TYPE_ID}/query`;

/**
 * project-lijst uit PlanningScreen (De). Geen extra velden verzonnen.
 * Tijd is geen apart attribuut; de plugin toont HH:mm uit laaddatum.
 * Hoeveelheidseenheid is geen attribuut; de plugin plakt hardcoded " t".
 */
export const SHIP_PLANNING_PROJECT_FIELDS = [
  "volgorde",
  "ordernummer",
  "laaddatum",
  "losdatum",
  "geplande_hoeveelheid",
  "transportprijs",
  "opmerkingenveld_planning",
  "opmerkingenveld_verwerker",
  "cognossement_sent",
  "benorbon_sent",
  "klant.zoeknaam",
  "conditie.omschrijving",
  "conditie.vervoerkosten",
  "laadplaats.zoeknaam",
  "losplaats.naam",
  "losplaats.plaatscode",
  "product.naam",
  "schip.naam",
  "schip.email",
  "schip.telefoonnummer_schipper",
  "vervoerder.naam",
] as const;

export const SHIP_PLANNING_PROJECT = SHIP_PLANNING_PROJECT_FIELDS.join(",");

/** Plugin-pageSize voor de ritlijst. */
export const SHIP_PLANNING_PAGE_SIZE = 999;

function normalize(value: string | number) {
  return JSON.stringify(value);
}

function geq(field: string, value: number) {
  return `${field} GEQ ${normalize(value)}`;
}

function leq(field: string, value: number) {
  return `${field} LEQ ${normalize(value)}`;
}

function neq(field: string, value: string) {
  return `${field} NEQ ${normalize(value)}`;
}

function and(parts: string[]) {
  return parts.filter((part) => part.length > 0).join(" AND ");
}

function or(parts: string[]) {
  return `(${parts.filter((part) => part.length > 0).join(" OR ")})`;
}

/**
 * Zelfde dagvenster als PlanningScreen:
 * (laaddatum GEQ/LEQ) OR (losdatum GEQ/LEQ), daarna AND status NEQ "geannuleerd".
 * Beide datumvelden, geen keuze tussen laad- en losdatum.
 */
export function shipPlanningDayFilter(startMs: number, endMs: number) {
  const loading = and([geq("laaddatum", startMs), leq("laaddatum", endMs)]);
  const unloading = and([geq("losdatum", startMs), leq("losdatum", endMs)]);
  const window = or([loading, unloading]);
  return and([window, neq("status", "geannuleerd")]);
}

export function shipPlanningQueryBody(startMs: number, endMs: number, pageSize = SHIP_PLANNING_PAGE_SIZE) {
  return {
    filter: shipPlanningDayFilter(startMs, endMs),
    pageSize,
    project: SHIP_PLANNING_PROJECT,
  };
}
