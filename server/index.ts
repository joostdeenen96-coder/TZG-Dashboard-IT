import express, { type NextFunction, type Request, type Response } from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { clientDistDir, resolveListenPort } from "./appPaths.js";
import { ConfigError, loadConfig } from "./config.js";
import { closePool } from "./db/pool.js";
import { logError, logInfo, logWarn } from "./log.js";
import { getRequestId, requestIdMiddleware } from "./requestId.js";
import { rateLimit } from "./rateLimit.js";
import { securityHeaders } from "./securityHeaders.js";
import { loadLocalEnv } from "./services/graphClient.js";

loadLocalEnv();

try {
  if (process.env.NODE_ENV === "production") loadConfig();
} catch (error) {
  const message = error instanceof ConfigError ? error.message : "Configuratie ongeldig.";
  logError(message, { event: "config.invalid" });
  process.exit(1);
}

import { adminRouter } from "./routes/admin.js";
import { agendaRouter } from "./routes/agenda.js";
import { configRouter } from "./routes/config.js";
import { dashboardsRouter } from "./routes/dashboards.js";
import { dieselSurchargeRouter } from "./routes/dieselSurcharge.js";
import { diagnosticsRouter, healthRouter, versionRouter } from "./routes/health.js";
import { newsRouter } from "./routes/news.js";
import { prtgRouter } from "./routes/prtg.js";
import { waterLevelsRouter } from "./routes/waterLevels.js";
import { getDashboardRepository } from "./dashboards/repository.js";
import { resolveRepositoryMode } from "./db/repositoryMode.js";
import { playerRouter } from "./routes/player.js";
import { auditRouter, screensRouter } from "./routes/screens.js";

const port = resolveListenPort();
const app = express();
const clientDir = clientDistDir();
const trust = Number(process.env.TRUST_PROXY || 0);
if (Number.isInteger(trust) && trust > 0) app.set("trust proxy", trust);

app.use(requestIdMiddleware);
app.use(securityHeaders);
app.use((req, res, next) => {
  const started = Date.now();
  res.on("finish", () => {
    const requestPath = req.originalUrl || req.url || "";
    const watched = requestPath.startsWith("/api/");
    if (!watched) return;
    logInfo(`api ${req.method} ${requestPath.split("?")[0]} ${res.statusCode}`, {
      event: "http",
      requestId: getRequestId(req),
      durationMs: Date.now() - started,
    });
  });
  next();
});

app.use(express.json({ limit: "256kb" }));
app.use((req, res, next) => {
  if ((req.originalUrl || req.url).length > 2048) {
    res.status(414).json({ error: "URL is te lang." });
    return;
  }
  next();
});

app.use("/api/health", healthRouter);
app.use("/api/version", versionRouter);
app.use("/api/diagnostics", diagnosticsRouter);
app.use("/api/admin", rateLimit({ name: "admin-write", windowMs: 60_000, max: 40 }), adminRouter);
app.use("/api/config", configRouter);
app.use("/api/dashboards", dashboardsRouter);
app.use(
  "/api/screens",
  rateLimit({ name: "screens-write", windowMs: 60_000, max: 40 }),
  screensRouter,
);
app.use(
  "/api/player",
  rateLimit({ name: "player", windowMs: 60_000, max: 30 }),
  playerRouter,
);
app.use("/api/audit", auditRouter);
app.use("/api/waterlevels", waterLevelsRouter);
app.use("/api/news", newsRouter);
app.use("/api/agenda", agendaRouter);
app.use("/api/wij-agenda", agendaRouter);
app.use("/api/dieselsurcharge", dieselSurchargeRouter);
app.use("/api/prtg", prtgRouter);

const repositoryMode = resolveRepositoryMode();
logInfo(`dashboardopslag ${repositoryMode}`, { event: "repository" });
if (repositoryMode === "json") {
  void getDashboardRepository()
    .getAll()
    .catch(() => {
      logWarn("dashboard json niet geladen", { event: "repository.json" });
    });
}

if (existsSync(path.join(clientDir, "index.html"))) {
  app.use(express.static(clientDir, { index: false, fallthrough: true }));
  app.get(/^(?!\/api(?:\/|$)).*/, (_req, res) => {
    res.sendFile(path.join(clientDir, "index.html"));
  });
} else {
  logWarn(`Geen frontendbuild in ${clientDir}. Alleen /api is beschikbaar (typisch tijdens lokale API+Vite).`);
}

app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
  const message = error instanceof Error ? error.message : "Onbekende serverfout.";
  const requestId = getRequestId(req);
  logError(`api ${message}`, { event: "http.error", requestId });
  if (!res.headersSent) {
    res.status(500).json({ error: "Verzoek mislukt.", requestId });
  }
});

const server = app.listen(port, "0.0.0.0", () => {
  logInfo(`applicatie gestart op poort ${port}`, { event: "startup" });
  logInfo(`health: http://127.0.0.1:${port}/api/health`, { event: "startup" });
  if (existsSync(path.join(clientDir, "index.html"))) {
    logInfo(`frontend: http://127.0.0.1:${port}/`, { event: "startup" });
  }
});

async function shutdown(signal: string) {
  logInfo(`stop ${signal}`, { event: "shutdown" });
  server.close(() => {
    void closePool().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 15_000).unref();
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

export { app, server };
