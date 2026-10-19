import { Router } from "express";
import {
  getDiagnostics,
  getHealth,
  getHealthBackups,
  getHealthScreens,
  getHealthSources,
  getLiveHealth,
  getReadyHealth,
  getVersionPayload,
} from "../services/healthService.js";
import { logError } from "../log.js";
import { rateLimit } from "../rateLimit.js";
import { readSession, tokenFromHeader } from "../services/adminSession.js";

export const healthRouter = Router();
export const versionRouter = Router();

healthRouter.get("/live", async (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json(await getLiveHealth());
});

healthRouter.get("/ready", async (_req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    const ready = await getReadyHealth();
    res.status(ready.status === "healthy" ? 200 : 503).json(ready);
  } catch {
    logError("health ready mislukt", { event: "health.ready" });
    res.status(503).json({ status: "unhealthy", error: "Niet ready." });
  }
});

healthRouter.get("/", async (_req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    const health = await getHealth();
    res.status(health.status === "unhealthy" ? 503 : 200).json(health);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Health mislukt.";
    logError(`health ${message}`, { event: "health" });
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
    logError("health screens mislukt", { event: "health.screens" });
    res.status(503).json({ error: "Schermstatus niet geladen." });
  }
});

healthRouter.get(
  "/sources",
  rateLimit({ name: "health-sources", windowMs: 60_000, max: 12 }),
  async (_req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store");
      res.json(await getHealthSources());
    } catch (error) {
      const message = error instanceof Error ? error.message : "Health sources mislukt.";
      logError(`health/sources ${message}`, { event: "health.sources" });
      const base = await getHealth().catch(() => ({ version: "0.0.0" }));
      res.status(500).json({
        status: "unhealthy",
        version: base.version,
        sources: [],
        error: "Broncontrole mislukt.",
      });
    }
  },
);

healthRouter.get("/backups", async (_req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    res.json(getHealthBackups());
  } catch {
    logError("health backups mislukt", { event: "health.backups" });
    res.status(500).json({ status: "unhealthy", error: "Backupstatus niet geladen." });
  }
});

versionRouter.get("/", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json(getVersionPayload());
});

export const diagnosticsRouter = Router();

diagnosticsRouter.use((req, res, next) => {
  if (!readSession(tokenFromHeader(req.header("authorization")))) {
    res.status(401).json({ error: "Niet aangemeld." });
    return;
  }
  next();
});

diagnosticsRouter.get("/", async (_req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    res.json(await getDiagnostics());
  } catch {
    logError("diagnose mislukt", { event: "diagnostics" });
    res.status(500).json({ error: "Diagnose niet geladen." });
  }
});
