import { Router } from "express";
import { getHealth, getHealthSources } from "../services/healthService.js";
import { logError } from "../log.js";

export const healthRouter = Router();

healthRouter.get("/", async (_req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    res.json(await getHealth());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Health mislukt.";
    logError(`health ${message}`);
    res.status(500).json({
      status: "unhealthy",
      version: "0.0.0",
      services: {
        api: "unhealthy",
        configuration: "unhealthy",
        dashboardRepository: "unhealthy",
      },
      error: "Healthcheck mislukt.",
    });
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
