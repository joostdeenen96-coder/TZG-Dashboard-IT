/** Leesbaarheid van Schepenplanning binnen het 2560×1440-podium (schaalt naar 1920×1080). */

export const PLANNING_STAGE = {
  stageWidth: 2560,
  stageHeight: 1440,
  viewportWidth: 1920,
  viewportHeight: 1080,
  paddingY: 40,
  header: 78,
  operations: 320,
  news: 88,
  agenda: 118,
  gap: 12,
  dayTitle: 36,
  tableHead: 28,
  groupHeader: 26,
  row: 30,
  minRow: 22,
} as const;

export type PlanningPresentation = "tomorrow" | "today-and-tomorrow";
export type PlanningDisplayMode = "Tomorrow" | "TodayAndTomorrow" | "Auto";

export function availablePlanningHeight(options: { news: boolean; agenda: boolean }) {
  const fixed =
    PLANNING_STAGE.header +
    PLANNING_STAGE.operations +
    (options.news ? PLANNING_STAGE.news : 0) +
    (options.agenda ? PLANNING_STAGE.agenda : 0);
  const sections = 3 + (options.news ? 1 : 0) + (options.agenda ? 1 : 0);
  const gaps = (sections - 1) * PLANNING_STAGE.gap;
  return PLANNING_STAGE.stageHeight - PLANNING_STAGE.paddingY - fixed - gaps;
}

export function estimateDayHeight(groupSizes: number[], rowHeight: number = PLANNING_STAGE.row) {
  const rows = groupSizes.reduce((sum, size) => sum + size, 0);
  const headers = groupSizes.length * PLANNING_STAGE.groupHeader;
  return PLANNING_STAGE.dayTitle + PLANNING_STAGE.tableHead + headers + rows * rowHeight;
}

function stackedHeight(days: number[][], columns: 1 | 2, rowHeight: number) {
  return days.reduce((sum, groups) => {
    const full = estimateDayHeight(groups, rowHeight);
    const body = Math.max(0, full - PLANNING_STAGE.dayTitle);
    return sum + PLANNING_STAGE.dayTitle + body / columns;
  }, 0);
}

export function resolvePlanningPresentation(input: {
  mode: PlanningDisplayMode;
  todayGroups: number[];
  tomorrowGroups: number[];
  news: boolean;
  agenda: boolean;
}): { presentation: PlanningPresentation; columns: 1 | 2; rowHeight: number } {
  const available = availablePlanningHeight({ news: input.news, agenda: input.agenda });
  const tomorrowHeight = estimateDayHeight(input.tomorrowGroups);
  const bothAtComfort = stackedHeight([input.todayGroups, input.tomorrowGroups], 1, PLANNING_STAGE.row);
  const bothAtDense = stackedHeight([input.todayGroups, input.tomorrowGroups], 2, PLANNING_STAGE.minRow);
  const readableBoth = bothAtComfort <= available || bothAtDense <= available;

  if (input.mode === "Tomorrow" || (input.mode === "Auto" && !readableBoth)) {
    const columns: 1 | 2 = tomorrowHeight <= available ? 1 : 2;
    return { presentation: "tomorrow", columns, rowHeight: PLANNING_STAGE.row };
  }
  const columns: 1 | 2 = bothAtComfort <= available ? 1 : 2;
  return {
    presentation: "today-and-tomorrow",
    columns,
    rowHeight: columns === 2 ? PLANNING_STAGE.minRow : PLANNING_STAGE.row,
  };
}

export function groupSizes(entries: { loadingLocation: string | null }[]) {
  const sizes: number[] = [];
  const index = new Map<string, number>();
  for (const entry of entries) {
    const name = entry.loadingLocation ?? "";
    const existing = index.get(name);
    if (existing == null) {
      index.set(name, sizes.length);
      sizes.push(1);
    } else {
      sizes[existing] = (sizes[existing] ?? 0) + 1;
    }
  }
  return sizes;
}
