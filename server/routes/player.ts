import { Router } from "express";
import { getDashboardRepository } from "../dashboards/repository.js";
import { isDatabaseUnavailable, unavailableMessage } from "../httpErrors.js";
import { logError, logWarn } from "../log.js";
import { getRequestId } from "../requestId.js";
import { recordHeartbeat, PostgresScreenRepository } from "../screens/repository.js";
import { heartbeatSeconds } from "../screens/status.js";
import { tokenFromHeader } from "../services/adminSession.js";
import { versionInfo } from "../version.js";

export const playerRouter = Router();

const screens = new PostgresScreenRepository();
const denied = "Dit scherm is niet geautoriseerd.";
const unassigned = "Dit scherm is nog niet gekoppeld aan een dashboard.";

playerRouter.get("/config", async (req, res) => {
  try {
    const auth = await screens.authenticate(tokenFromHeader(req.header("authorization")));
    if (auth?.state !== "ok") {
      res.status(auth?.state === "disabled" ? 403 : 401).json({ error: denied });
      return;
    }
    const dashboard = auth.screen.dashboardId
      ? await getDashboardRepository().getById(auth.screen.dashboardId)
      : null;
    res.setHeader("Cache-Control", "no-store");
    res.json({
      screen: {
        id: auth.screen.id,
        name: auth.screen.name,
        slug: auth.screen.slug,
        location: auth.screen.location,
      },
      dashboard: dashboard && dashboard.enabled ? dashboard : null,
      message: dashboard && dashboard.enabled ? undefined : unassigned,
      heartbeatIntervalSeconds: heartbeatSeconds(),
      appVersion: versionInfo().version,
    });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      res.status(503).json({ error: unavailableMessage(), requestId: getRequestId(req) });
      return;
    }
    logError("player config mislukt", { event: "player.config", requestId: getRequestId(req) });
    res.status(500).json({ error: "Playerconfiguratie niet geladen.", requestId: getRequestId(req) });
  }
});

playerRouter.post("/heartbeat", async (req, res) => {
  try {
    const auth = await screens.authenticate(tokenFromHeader(req.header("authorization")));
    if (auth?.state !== "ok") {
      res.status(auth?.state === "disabled" ? 403 : 401).json({ error: denied });
      return;
    }
    const body = req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {};
    const metadata =
      body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
        ? (body.metadata as Record<string, unknown>)
        : undefined;
    const appVersion = typeof body.appVersion === "string" ? body.appVersion.slice(0, 40) : versionInfo().version;
    await recordHeartbeat(auth.screen.id, {
      appVersion,
      status: typeof body.status === "string" ? body.status.slice(0, 40) : "ok",
      metadata,
    });
    res.json({ ok: true });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      res.status(503).json({ error: unavailableMessage(), requestId: getRequestId(req) });
      return;
    }
    logWarn("heartbeatfout", { event: "player.heartbeat", requestId: getRequestId(req) });
    res.status(500).json({ error: "Heartbeat niet opgeslagen.", requestId: getRequestId(req) });
  }
});
