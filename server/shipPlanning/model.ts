export type ShipPlanningStatus = "ok" | "stale" | "unavailable";

export type ShipPlanningScope = "tomorrow" | "today-and-tomorrow";

export type ShipPlanningDisplayMode = "Tomorrow" | "TodayAndTomorrow" | "Auto";

export type ShipPlanningEntry = {
  sourceId: string | null;
  sourceOrder: number | null;
  loadingLocation: string | null;
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
  status: ShipPlanningStatus | "disabled";
  days: ShipPlanningDay[];
  retrievedAt: string;
};
