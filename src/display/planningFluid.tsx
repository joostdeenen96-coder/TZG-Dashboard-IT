import { createContext, useContext, type ReactNode } from "react";

const PlanningFluidContext = createContext(false);

export function PlanningFluidProvider({ children }: { children: ReactNode }) {
  return <PlanningFluidContext.Provider value={true}>{children}</PlanningFluidContext.Provider>;
}

export function usePlanningFluid() {
  return useContext(PlanningFluidContext);
}

/** Shares of the area under the header. Gaps and padding sit outside these tracks. */
export const PLANNING_TRACKS = {
  operations: "minmax(0, 39.4fr)",
  ships: "minmax(0, 32fr)",
  news: "minmax(0, 11.1fr)",
  agenda: "minmax(0, 6.5fr)",
} as const;

/**
 * On tall 16:9 viewports the ship rows must not keep growing with the card.
 * The freed share goes to the water charts. News and agenda stay on the same tracks.
 */
export const PLANNING_TRACKS_TALL = {
  operations: "minmax(0, 47.4fr)",
  ships: "minmax(0, 24fr)",
  news: "minmax(0, 11.1fr)",
  agenda: "minmax(0, 6.5fr)",
} as const;

function rowsFor(
  tracks: { operations: string; ships: string; news: string; agenda: string },
  hasOperations: boolean,
  hasNews: boolean,
  hasAgenda: boolean,
) {
  const rows = ["auto"];
  if (hasOperations) rows.push(tracks.operations);
  rows.push(tracks.ships);
  if (hasNews) rows.push(tracks.news);
  if (hasAgenda) rows.push(tracks.agenda);
  return rows.join(" ");
}

export function planningGridRows(hasOperations: boolean, hasNews: boolean, hasAgenda: boolean) {
  return rowsFor(PLANNING_TRACKS, hasOperations, hasNews, hasAgenda);
}

export function planningGridRowsTall(hasOperations: boolean, hasNews: boolean, hasAgenda: boolean) {
  return rowsFor(PLANNING_TRACKS_TALL, hasOperations, hasNews, hasAgenda);
}
