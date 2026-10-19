import { Router } from "express";
import { DashboardValidationError } from "../dashboards/model.js";
import { getDashboardRepository } from "../dashboards/repository.js";
import { isDatabaseUnavailable, unavailableMessage } from "../httpErrors.js";
import { logError, logWarn } from "../log.js";
import { readSession, tokenFromHeader } from "../services/adminSession.js";

export const dashboardsRouter = Router();

function requireAdmin(header: string | undefined) {
  return readSession(tokenFromHeader(header));
}

function publicError(status: number, message: string, res: import("express").Response) {
  res.status(status).json({ error: message });
}

function failDb(error: unknown, fallback: string, res: import("express").Response) {
  if (isDatabaseUnavailable(error)) {
    publicError(503, unavailableMessage(), res);
    return true;
  }
  logError(fallback);
  return false;
}

dashboardsRouter.get("/", async (_req, res) => {
  try {
    const items = await getDashboardRepository().getAll();
    res.setHeader("Cache-Control", "no-store");
    res.json({ dashboards: items });
  } catch (error) {
    if (failDb(error, "dashboards list mislukt", res)) return;
    publicError(500, "Dashboards niet geladen.", res);
  }
});

dashboardsRouter.get("/by-slug/:slug", async (req, res) => {
  try {
    const slug = typeof req.params.slug === "string" ? req.params.slug : "";
    const item = await getDashboardRepository().getBySlug(slug);
    if (!item) {
      publicError(404, "Dashboard niet gevonden.", res);
      return;
    }
    res.setHeader("Cache-Control", "no-store");
    res.json(item);
  } catch (error) {
    if (failDb(error, "dashboards by-slug mislukt", res)) return;
    publicError(500, "Dashboard niet geladen.", res);
  }
});

dashboardsRouter.get("/:id", async (req, res) => {
  try {
    const id = typeof req.params.id === "string" ? req.params.id : "";
    const item = await getDashboardRepository().getById(id);
    if (!item) {
      publicError(404, "Dashboard niet gevonden.", res);
      return;
    }
    res.setHeader("Cache-Control", "no-store");
    res.json(item);
  } catch (error) {
    if (failDb(error, "dashboards get mislukt", res)) return;
    publicError(500, "Dashboard niet geladen.", res);
  }
});

dashboardsRouter.post("/", async (req, res) => {
  if (!requireAdmin(req.header("authorization"))) {
    publicError(401, "Niet aangemeld.", res);
    return;
  }
  try {
    const created = await getDashboardRepository().create(req.body, { actor: "admin" });
    res.status(201).json(created);
  } catch (error) {
    if (error instanceof DashboardValidationError) {
      publicError(400, error.message, res);
      return;
    }
    if (failDb(error, "dashboards create mislukt", res)) return;
    publicError(500, "Dashboard niet aangemaakt.", res);
  }
});

dashboardsRouter.put("/:id", async (req, res) => {
  if (!requireAdmin(req.header("authorization"))) {
    publicError(401, "Niet aangemeld.", res);
    return;
  }
  try {
    const id = typeof req.params.id === "string" ? req.params.id : "";
    const existing = await getDashboardRepository().getById(id);
    if (!existing) {
      publicError(404, "Dashboard niet gevonden.", res);
      return;
    }
    const updated = await getDashboardRepository().update(id, req.body, { actor: "admin" });
    res.json(updated);
  } catch (error) {
    if (error instanceof DashboardValidationError) {
      publicError(400, error.message, res);
      return;
    }
    if (failDb(error, "dashboards update mislukt", res)) return;
    publicError(500, "Dashboard niet bijgewerkt.", res);
  }
});

dashboardsRouter.delete("/:id", async (req, res) => {
  if (!requireAdmin(req.header("authorization"))) {
    publicError(401, "Niet aangemeld.", res);
    return;
  }
  try {
    const id = typeof req.params.id === "string" ? req.params.id : "";
    const removed = await getDashboardRepository().delete(id, { actor: "admin" });
    if (!removed) {
      publicError(404, "Dashboard niet gevonden.", res);
      return;
    }
    res.status(204).send();
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      publicError(503, unavailableMessage(), res);
      return;
    }
    logWarn("dashboards delete mislukt");
    publicError(500, "Dashboard niet verwijderd.", res);
  }
});
