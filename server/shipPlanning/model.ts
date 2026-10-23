export type ShipPlanningStatus = "ok" | "stale" | "unavailable";

export type ShipPlanningScope = "auto" | "today" | "tomorrow" | "today-and-tomorrow";

export type ShipPlanningDisplayMode = "Auto" | "Today" | "Tomorrow" | "TodayAndTomorrow";

export type ShipPlanningDisplayedDay = "today" | "tomorrow";

export type ShipPlanningSwitchReason =
  | "today-active"
  | "today-empty-confirmed"
  | "manual-override"
  | "stale-today"
  | "source-unavailable";

export type ShipPlanningEntry = {
  sourceId: string | null;
  sourceOrder: number | null;
  loadingLocation: string | null;
  /** Epoch ms van laaddatum. Ontbreekt als de bron geen geldige laaddatum heeft. */
  loadingAt: number | null;
  time: string | null;
  customer: string | null;
  unloadingLocation: string | null;
  condition: string | null;
  product: string | null;
  quantity: number | null;
  quantityUnit: string | null;
  vessel: string | null;
  orderNumber: string | null;
  carrier: string | null;
  phoneNumber: string | null;
  unloadingDate: string | null;
  planningRemark: string | null;
};

export type ShipPlanningDay = {
  date: string;
  entries: ShipPlanningEntry[];
  retrievedAt: string;
  sourceUpdatedAt: string | null;
  status: ShipPlanningStatus;
};

export type ShipPlanningResponse = {
  scope: ShipPlanningScope;
  displayedDay: ShipPlanningDisplayedDay;
  switchReason: ShipPlanningSwitchReason;
  status: ShipPlanningStatus | "disabled";
  todayRecordCount: number | null;
  tomorrowRecordCount: number | null;
  todayEmptyConfirmed: boolean;
  days: ShipPlanningDay[];
  retrievedAt: string;
};
