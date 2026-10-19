import { Router } from "express";
import { getHealth, getHealthSources } from "../services/healthService.js";
import { logError } from "../log.js";

export const healthRouter = Router();

healthRouter.get("/", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json(getHealth());
});

healthRouter.get("/sources", async (_req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    res.json(await getHealthSources());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Health sources mislukt.";
    logError(`health/sources ${message}`);
    res.status(500).json({
      status: "unhealthy",
      version: getHealth().version,
      sources: [],
      error: "Broncontrole mislukt.",
    });
  }
});
