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
  operations: "minmax(0, 42fr)",
  ships: "minmax(0, 32fr)",
  news: "minmax(0, 8.5fr)",
  agenda: "minmax(0, 6.5fr)",
} as const;

export function planningGridRows(hasOperations: boolean, hasNews: boolean, hasAgenda: boolean) {
  const rows = ["auto"];
  if (hasOperations) rows.push(PLANNING_TRACKS.operations);
  rows.push(PLANNING_TRACKS.ships);
  if (hasNews) rows.push(PLANNING_TRACKS.news);
  if (hasAgenda) rows.push(PLANNING_TRACKS.agenda);
  return rows.join(" ");
}
