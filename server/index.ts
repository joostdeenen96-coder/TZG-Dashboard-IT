import express, { type NextFunction, type Request, type Response } from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { clientDistDir, resolveListenPort } from "./appPaths.js";
import { logError, logInfo, logWarn } from "./log.js";
import { loadLocalEnv } from "./services/graphClient.js";

loadLocalEnv();

import { adminRouter } from "./routes/admin.js";
import { agendaRouter } from "./routes/agenda.js";
import { configRouter } from "./routes/config.js";
import { dashboardsRouter } from "./routes/dashboards.js";
import { dieselSurchargeRouter } from "./routes/dieselSurcharge.js";
import { healthRouter } from "./routes/health.js";
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

app.use((req, res, next) => {
  const started = Date.now();
  res.on("finish", () => {
    const requestPath = req.originalUrl || req.url || "";
    const watched =
      requestPath.startsWith("/api/waterlevels") ||
      requestPath.startsWith("/api/dieselsurcharge") ||
      requestPath.startsWith("/api/news") ||
      requestPath.startsWith("/api/agenda") ||
      requestPath.startsWith("/api/wij-agenda") ||
      requestPath.startsWith("/api/prtg") ||
      requestPath.startsWith("/api/dashboards") ||
      requestPath.startsWith("/api/screens") ||
      requestPath.startsWith("/api/player") ||
      requestPath.startsWith("/api/audit") ||
      requestPath.startsWith("/api/health");
    if (!watched) return;
    const line = `api ${req.method} ${requestPath.split("?")[0]} ${res.statusCode} ${Date.now() - started}ms`;
    if (res.statusCode >= 500) logError(line);
    else logInfo(line);
  });
  next();
});

app.use(express.json({ limit: "256kb" }));
app.use("/api/health", healthRouter);
app.use("/api/admin", adminRouter);
app.use("/api/config", configRouter);
app.use("/api/dashboards", dashboardsRouter);
app.use("/api/screens", screensRouter);
app.use("/api/player", playerRouter);
app.use("/api/audit", auditRouter);
app.use("/api/waterlevels", waterLevelsRouter);
app.use("/api/news", newsRouter);
app.use("/api/agenda", agendaRouter);
app.use("/api/wij-agenda", agendaRouter);
app.use("/api/dieselsurcharge", dieselSurchargeRouter);
app.use("/api/prtg", prtgRouter);

const repositoryMode = resolveRepositoryMode();
logInfo(`dashboardopslag ${repositoryMode}`);
if (repositoryMode === "json") {
  void getDashboardRepository()
    .getAll()
    .catch(() => {
      logWarn("dashboard json niet geladen");
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

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const message = error instanceof Error ? error.message : "Onbekende serverfout.";
  logError(`api ${message}`);
  if (!res.headersSent) res.status(500).json({ error: "Verzoek mislukt." });
});

app.listen(port, "0.0.0.0", () => {
  logInfo(`applicatie gestart op poort ${port}`);
  logInfo(`health: http://127.0.0.1:${port}/api/health`);
  if (existsSync(path.join(clientDir, "index.html"))) {
    logInfo(`frontend: http://127.0.0.1:${port}/`);
  }
});
