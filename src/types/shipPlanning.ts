export type ShipPlanningStatus = "ok" | "stale" | "unavailable" | "disabled";

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
  status: Exclude<ShipPlanningStatus, "disabled">;
};

export type ShipPlanningResponse = {
  scope: "tomorrow" | "today-and-tomorrow";
  status: ShipPlanningStatus;
  days: ShipPlanningDay[];
  retrievedAt: string;
};

export type ShipPlanningSettings = {
  enabled: boolean;
  displayMode: "Tomorrow" | "TodayAndTomorrow" | "Auto";
  refreshIntervalSeconds: number;
  maxRows: number;
};

export type ShipPlanningAdminSettings = ShipPlanningSettings & {
  credentialStatus: "configured" | "not-configured";
};
