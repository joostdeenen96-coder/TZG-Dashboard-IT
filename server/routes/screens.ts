import { Router } from "express";
import { listRecentAudit } from "../audit/repository.js";
import { DashboardValidationError } from "../dashboards/model.js";
import { isDatabaseUnavailable, unavailableMessage } from "../httpErrors.js";
import { logError } from "../log.js";
import { rateLimit } from "../rateLimit.js";
import { readSession, tokenFromHeader } from "../services/adminSession.js";
import { PostgresScreenRepository } from "../screens/repository.js";

export const screensRouter = Router();
export const auditRouter = Router();

const screens = new PostgresScreenRepository();

function requireAdmin(header: string | undefined) {
  return readSession(tokenFromHeader(header));
}

function fail(res: import("express").Response, status: number, message: string) {
  res.status(status).json({ error: message });
}

function handleDb(res: import("express").Response, error: unknown, fallback: string) {
  if (isDatabaseUnavailable(error)) {
    fail(res, 503, unavailableMessage());
    return true;
  }
  logError(fallback);
  return false;
}

screensRouter.use((req, res, next) => {
  if (!requireAdmin(req.header("authorization"))) {
    fail(res, 401, "Niet aangemeld.");
    return;
  }
  next();
});

auditRouter.use((req, res, next) => {
  if (!requireAdmin(req.header("authorization"))) {
    fail(res, 401, "Niet aangemeld.");
    return;
  }
  next();
});

screensRouter.get("/", async (_req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    res.json({ screens: await screens.list() });
  } catch (error) {
    if (handleDb(res, error, "screens list mislukt")) return;
    fail(res, 500, "Schermen niet geladen.");
  }
});

screensRouter.post("/", async (req, res) => {
  try {
    const created = await screens.create(req.body, "admin");
    res.status(201).json(created);
  } catch (error) {
    if (error instanceof DashboardValidationError) {
      fail(res, 400, error.message);
      return;
    }
    if (handleDb(res, error, "screens create mislukt")) return;
    fail(res, 500, "Scherm niet aangemaakt.");
  }
});

screensRouter.put("/:id", async (req, res) => {
  try {
    const id = typeof req.params.id === "string" ? req.params.id : "";
    const updated = await screens.update(id, req.body, "admin");
    if (!updated) {
      fail(res, 404, "Scherm niet gevonden.");
      return;
    }
    res.json(updated);
  } catch (error) {
    if (error instanceof DashboardValidationError) {
      fail(res, 400, error.message);
      return;
    }
    if (handleDb(res, error, "screens update mislukt")) return;
    fail(res, 500, "Scherm niet bijgewerkt.");
  }
});

screensRouter.delete("/:id", async (req, res) => {
  try {
    const id = typeof req.params.id === "string" ? req.params.id : "";
    const removed = await screens.delete(id, "admin");
    if (!removed) {
      fail(res, 404, "Scherm niet gevonden.");
      return;
    }
    res.status(204).send();
  } catch (error) {
    if (handleDb(res, error, "screens delete mislukt")) return;
    fail(res, 500, "Scherm niet verwijderd.");
  }
});

screensRouter.post("/:id/tokens", rateLimit({ name: "token-issue", windowMs: 60_000, max: 10 }), async (req, res) => {
  try {
    const id = typeof req.params.id === "string" ? req.params.id : "";
    const issued = await screens.issueToken(id, "admin");
    if (!issued) {
      fail(res, 404, "Scherm niet gevonden.");
      return;
    }
    res.status(201).json(issued);
  } catch (error) {
    if (handleDb(res, error, "token create mislukt")) return;
    fail(res, 500, "Token niet aangemaakt.");
  }
});

screensRouter.post("/:id/tokens/revoke", rateLimit({ name: "token-revoke", windowMs: 60_000, max: 20 }), async (req, res) => {
  try {
    const id = typeof req.params.id === "string" ? req.params.id : "";
    const count = await screens.revokeTokens(id, "admin");
    if (count === null) {
      fail(res, 404, "Scherm niet gevonden.");
      return;
    }
    res.json({ revoked: count });
  } catch (error) {
    if (handleDb(res, error, "token revoke mislukt")) return;
    fail(res, 500, "Token niet ingetrokken.");
  }
});

auditRouter.get("/", async (_req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    res.json({ entries: await listRecentAudit(40) });
  } catch (error) {
    if (handleDb(res, error, "auditlogfout lijst")) return;
    fail(res, 500, "Activiteit niet geladen.");
  }
});
