import { Router } from "express";
import type { ShipPlanningScope } from "../shipPlanning/model.js";
import { getShipPlanning } from "../shipPlanning/service.js";
import { getShipPlanningSettings } from "../shipPlanning/settings.js";

export const shipPlanningRouter = Router();

function scopeOf(value: unknown): ShipPlanningScope | null {
  if (value === undefined || value === "tomorrow") return "tomorrow";
  if (value === "today-and-tomorrow") return "today-and-tomorrow";
  return null;
}

shipPlanningRouter.get("/settings", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const settings = getShipPlanningSettings();
  res.json({
    enabled: settings.enabled,
    displayMode: settings.displayMode,
    refreshIntervalSeconds: settings.refreshIntervalSeconds,
    maxRows: settings.maxRows,
  });
});

shipPlanningRouter.get("/", async (req, res) => {
  const scope = scopeOf(req.query.scope);
  if (!scope) {
    res.status(400).json({ error: "scope moet tomorrow of today-and-tomorrow zijn." });
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  const payload = await getShipPlanning(scope);
  res.json(payload);
});
