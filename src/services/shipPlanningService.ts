import { useEffect, useState } from "react";
import { adminAuthHeaders } from "./adminService";
import type { ShipPlanningAdminSettings, ShipPlanningResponse, ShipPlanningSettings } from "../types/shipPlanning";

const defaultSettings: ShipPlanningSettings = {
  enabled: true,
  displayMode: "Tomorrow",
  refreshIntervalSeconds: 300,
  maxRows: 80,
};

async function readJson(response: Response) {
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
        ? payload.error
        : "Schepenplanning niet geladen.";
    throw new Error(message);
  }
  return payload;
}

export async function fetchShipPlanningSettings() {
  const response = await fetch("/api/ship-planning/settings");
  const payload = await readJson(response);
  if (!payload || typeof payload !== "object") return defaultSettings;
  const row = payload as Partial<ShipPlanningSettings>;
  return {
    enabled: row.enabled !== false,
    displayMode:
      row.displayMode === "TodayAndTomorrow" || row.displayMode === "Auto" || row.displayMode === "Tomorrow"
        ? row.displayMode
        : "Tomorrow",
    refreshIntervalSeconds:
      typeof row.refreshIntervalSeconds === "number" ? row.refreshIntervalSeconds : defaultSettings.refreshIntervalSeconds,
    maxRows: typeof row.maxRows === "number" ? row.maxRows : defaultSettings.maxRows,
  } satisfies ShipPlanningSettings;
}

export async function fetchShipPlanning(scope: "tomorrow" | "today-and-tomorrow") {
  const response = await fetch(`/api/ship-planning?scope=${scope}`);
  return (await readJson(response)) as ShipPlanningResponse;
}

export function useShipPlanning() {
  const [settings, setSettings] = useState<ShipPlanningSettings>(defaultSettings);
  const [data, setData] = useState<ShipPlanningResponse | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const nextSettings = await fetchShipPlanningSettings();
        if (!active) return;
        setSettings(nextSettings);
        if (!nextSettings.enabled) {
          setData({
            scope: "tomorrow",
            status: "disabled",
            days: [],
            retrievedAt: new Date().toISOString(),
          });
          setError(false);
          return;
        }
        const scope = nextSettings.displayMode === "Tomorrow" ? "tomorrow" : "today-and-tomorrow";
        const payload = await fetchShipPlanning(scope);
        if (!active) return;
        setData(payload);
        setError(false);
      } catch {
        if (!active) return;
        setError(true);
      }
    };
    void load();
    const interval = window.setInterval(() => void load(), Math.max(settings.refreshIntervalSeconds, 60) * 1000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [settings.refreshIntervalSeconds]);

  return { settings, data, error };
}

export async function fetchShipPlanningAdminSettings() {
  const response = await fetch("/api/admin/ship-planning", { headers: adminAuthHeaders() });
  const payload = await readJson(response);
  return payload as ShipPlanningAdminSettings;
}

export async function saveShipPlanningAdminSettings(settings: ShipPlanningSettings) {
  const response = await fetch("/api/admin/ship-planning", {
    method: "PUT",
    headers: { "content-type": "application/json", ...adminAuthHeaders() },
    body: JSON.stringify({
      enabled: settings.enabled,
      displayMode: settings.displayMode,
      refreshIntervalSeconds: settings.refreshIntervalSeconds,
      maxRows: settings.maxRows,
    }),
  });
  const payload = await readJson(response);
  return payload as ShipPlanningAdminSettings;
}
