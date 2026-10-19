import { Router } from "express";
import { getHealth, getHealthScreens, getHealthSources } from "../services/healthService.js";
import { logError } from "../log.js";

export const healthRouter = Router();

healthRouter.get("/", async (_req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    const health = await getHealth();
    res.status(health.status === "unhealthy" ? 503 : 200).json(health);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Health mislukt.";
    logError(`health ${message}`);
    res.status(500).json({
      status: "unhealthy",
      version: "0.0.0",
      services: {
        api: "unhealthy",
        configuration: "unhealthy",
        database: "unhealthy",
        dashboardRepository: "unhealthy",
      },
      error: "Healthcheck mislukt.",
    });
  }
});

healthRouter.get("/screens", async (_req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    res.json(await getHealthScreens());
  } catch {
    logError("health screens mislukt");
    res.status(500).json({ error: "Schermstatus niet geladen." });
  }
});

healthRouter.get("/sources", async (_req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    res.json(await getHealthSources());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Health sources mislukt.";
    logError(`health/sources ${message}`);
    const base = await getHealth().catch(() => ({ version: "0.0.0" }));
    res.status(500).json({
      status: "unhealthy",
      version: base.version,
      sources: [],
      error: "Broncontrole mislukt.",
    });
  }
});
