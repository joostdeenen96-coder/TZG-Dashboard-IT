import { Router } from "express";
import { resetGraphCache, testSharePointConnection } from "../providers/sharePointDieselProvider.js";
import { resetWijNewsCache, testNewsLibrary } from "../providers/wijNewsProvider.js";
import {
  clearLoginFailures,
  createSession,
  dropSession,
  loginLocked,
  noteLoginFailure,
  readSession,
  tokenFromHeader,
} from "../services/adminSession.js";
import { getDashboardConfig, parseDashboardConfig, saveDashboardConfig } from "../services/dashboardConfig.js";
import { checkAdminLogin, getPublicSettings, updateSettings } from "../services/settingsService.js";

export const adminRouter = Router();

function requireAdmin(header: string | undefined) {
  return readSession(tokenFromHeader(header));
}

adminRouter.get("/session", (req, res) => {
  res.json({ authenticated: requireAdmin(req.header("authorization")) });
});

adminRouter.post("/login", (req, res) => {
  const username = typeof req.body?.username === "string" ? req.body.username : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const key = req.ip || "lokaal";
  if (loginLocked(key)) {
    res.status(429).json({ error: "Te veel pogingen. Wacht een minuut." });
    return;
  }
  if (!checkAdminLogin(username, password)) {
    noteLoginFailure(key);
    res.status(401).json({ error: "Gebruikersnaam of wachtwoord klopt niet." });
    return;
  }
  clearLoginFailures(key);
  res.json({ token: createSession() });
});

adminRouter.post("/logout", (req, res) => {
  dropSession(tokenFromHeader(req.header("authorization")));
  res.json({ ok: true });
});

adminRouter.get("/settings", (req, res) => {
  if (!requireAdmin(req.header("authorization"))) {
    res.status(401).json({ error: "Niet aangemeld." });
    return;
  }
  res.json(getPublicSettings());
});

adminRouter.put("/settings", (req, res) => {
  if (!requireAdmin(req.header("authorization"))) {
    res.status(401).json({ error: "Niet aangemeld." });
    return;
  }
  const body = req.body ?? {};
  try {
    const settings = updateSettings({
      tenantId: typeof body.tenantId === "string" ? body.tenantId : "",
      clientId: typeof body.clientId === "string" ? body.clientId : "",
      clientSecret: typeof body.clientSecret === "string" ? body.clientSecret : "",
      siteUrl: typeof body.siteUrl === "string" ? body.siteUrl : "",
      listName: typeof body.listName === "string" ? body.listName : "",
      newPassword: typeof body.newPassword === "string" ? body.newPassword : "",
    });
    resetGraphCache();
    resetWijNewsCache();
    res.json(settings);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Instellingen niet opgeslagen.";
    res.status(400).json({ error: message });
  }
});

adminRouter.get("/config", (req, res) => {
  if (!requireAdmin(req.header("authorization"))) {
    res.status(401).json({ error: "Niet aangemeld." });
    return;
  }
  res.json(getDashboardConfig());
});

adminRouter.put("/config", (req, res) => {
  if (!requireAdmin(req.header("authorization"))) {
    res.status(401).json({ error: "Niet aangemeld." });
    return;
  }
  try {
    const body = req.body ?? {};
    const current = getDashboardConfig();
    const config = saveDashboardConfig({
      ...body,
      prtg: body && typeof body === "object" && "prtg" in body ? body.prtg : current.prtg,
    });
    resetGraphCache();
    resetWijNewsCache();
    res.json(config);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Instellingen niet opgeslagen.";
    res.status(400).json({ error: message });
  }
});

adminRouter.post("/test", async (req, res) => {
  if (!requireAdmin(req.header("authorization"))) {
    res.status(401).json({ error: "Niet aangemeld." });
    return;
  }
  try {
    const body = req.body ?? {};
    const hasForm =
      body &&
      typeof body === "object" &&
      ("sharepointDiesel" in body || "sharepointNieuws" in body);
    const current = getDashboardConfig();
    const config = hasForm
      ? parseDashboardConfig({
          sharepointDiesel: body.sharepointDiesel ?? current.sharepointDiesel,
          sharepointNieuws: body.sharepointNieuws ?? current.sharepointNieuws,
          weer: body.weer ?? current.weer,
          dashboard: body.dashboard ?? current.dashboard,
          prtg: body.prtg ?? current.prtg,
        })
      : current;
    const diesel = await testSharePointConnection(config.sharepointDiesel.siteUrl, config.sharepointDiesel.lijstnaam);
    const nieuws = await testNewsLibrary(config.sharepointNieuws.siteUrl, config.sharepointNieuws.bibliotheek);
    res.json({ ok: true, message: `${diesel} ${nieuws}` });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Verbinding mislukt.";
    console.error(`Graph-test mislukt: ${message}`);
    res.status(502).json({ error: message });
  }
});
