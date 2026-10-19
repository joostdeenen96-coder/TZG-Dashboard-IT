import { Router } from "express";
import { DashboardValidationError } from "../dashboards/model.js";
import { getDashboardRepository } from "../dashboards/repository.js";
import { logError, logWarn } from "../log.js";
import { readSession, tokenFromHeader } from "../services/adminSession.js";

export const dashboardsRouter = Router();

function requireAdmin(header: string | undefined) {
  return readSession(tokenFromHeader(header));
}

function publicError(status: number, message: string, res: import("express").Response) {
  res.status(status).json({ error: message });
}

dashboardsRouter.get("/", async (_req, res) => {
  try {
    const items = await getDashboardRepository().getAll();
    res.setHeader("Cache-Control", "no-store");
    res.json({ dashboards: items });
  } catch (error) {
    logError(`dashboards list ${error instanceof Error ? error.message : "mislukt"}`);
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
    logError(`dashboards by-slug ${error instanceof Error ? error.message : "mislukt"}`);
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
    logError(`dashboards get ${error instanceof Error ? error.message : "mislukt"}`);
    publicError(500, "Dashboard niet geladen.", res);
  }
});

dashboardsRouter.post("/", async (req, res) => {
  if (!requireAdmin(req.header("authorization"))) {
    publicError(401, "Niet aangemeld.", res);
    return;
  }
  try {
    const created = await getDashboardRepository().create(req.body);
    res.status(201).json(created);
  } catch (error) {
    if (error instanceof DashboardValidationError) {
      publicError(400, error.message, res);
      return;
    }
    logError(`dashboards create ${error instanceof Error ? error.message : "mislukt"}`);
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
    const updated = await getDashboardRepository().update(id, req.body);
    res.json(updated);
  } catch (error) {
    if (error instanceof DashboardValidationError) {
      publicError(400, error.message, res);
      return;
    }
    logError(`dashboards update ${error instanceof Error ? error.message : "mislukt"}`);
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
    const removed = await getDashboardRepository().delete(id);
    if (!removed) {
      publicError(404, "Dashboard niet gevonden.", res);
      return;
    }
    res.status(204).send();
  } catch (error) {
    logWarn(`dashboards delete ${error instanceof Error ? error.message : "mislukt"}`);
    publicError(500, "Dashboard niet verwijderd.", res);
  }
});
