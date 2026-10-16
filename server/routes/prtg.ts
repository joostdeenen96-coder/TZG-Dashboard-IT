import { Router } from "express";
import { getPrtgDashboard } from "../services/prtgService.js";

export const prtgRouter = Router();

prtgRouter.get("/", async (_req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    res.json(await getPrtgDashboard());
  } catch (error) {
    const message = error instanceof Error ? error.message : "PRTG niet beschikbaar.";
    console.error(`[teunesen-tv] ${new Date().toISOString()} error prtg ${message}`);
    res.status(502).json({
      connected: false,
      configured: false,
      filterReady: false,
      source: "PRTG",
      fetchedAt: null,
      error: "PRTG niet beschikbaar.",
      alarms: [],
      servers: [],
    });
  }
});
