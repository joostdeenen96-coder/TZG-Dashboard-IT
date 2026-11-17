import { Router } from "express";
import { getServerResources, isServerResourceId } from "../services/prtgResourceService.js";
import { responseHasSecrets } from "../prtg/resourceModel.js";
import { logError } from "../log.js";

export const ictServersRouter = Router();

ictServersRouter.get("/servers/:serverId/resources", async (req, res) => {
  const serverId = req.params.serverId;
  if (typeof serverId !== "string" || !isServerResourceId(serverId)) {
    res.status(400).json({ error: "Onbekende server." });
    return;
  }
  try {
    res.setHeader("Cache-Control", "no-store");
    const payload = await getServerResources(serverId);
    if (responseHasSecrets(payload)) {
      logError("serverdetails bevatten een geheim en zijn tegengehouden", { event: "prtg.resources" });
      res.status(500).json({ error: "Servergegevens tijdelijk niet beschikbaar" });
      return;
    }
    res.status(payload.server ? 200 : 200).json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Servergegevens mislukt.";
    logError(`serverdetails ${message}`, { event: "prtg.resources" });
    res.status(200).json({
      source: "PRTG",
      retrievedAt: null,
      cacheStatus: "unavailable",
      staleReason: null,
      error: "Servergegevens tijdelijk niet beschikbaar",
      server: null,
    });
  }
});
