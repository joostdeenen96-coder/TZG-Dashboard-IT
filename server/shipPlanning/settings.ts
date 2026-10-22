import { shipPlanningCredentialsConfigured } from "./client.js";
import { getDashboardConfig, saveDashboardConfig, type ShipPlanningSettings } from "../services/dashboardConfig.js";

export type { ShipPlanningSettings };

export type ShipPlanningAdminSettings = ShipPlanningSettings & {
  credentialStatus: "configured" | "not-configured";
};

export function shipPlanningCredentialStatus(): ShipPlanningAdminSettings["credentialStatus"] {
  return shipPlanningCredentialsConfigured() ? "configured" : "not-configured";
}

export function getShipPlanningSettings(): ShipPlanningSettings {
  const { shipPlanning } = getDashboardConfig();
  return { ...shipPlanning };
}

export function getShipPlanningAdminSettings(): ShipPlanningAdminSettings {
  return { ...getShipPlanningSettings(), credentialStatus: shipPlanningCredentialStatus() };
}

export function saveShipPlanningSettings(value: unknown): ShipPlanningAdminSettings {
  const current = getDashboardConfig();
  const saved = saveDashboardConfig({ ...current, shipPlanning: value });
  return { ...saved.shipPlanning, credentialStatus: shipPlanningCredentialStatus() };
}
