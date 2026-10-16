import express, { type NextFunction, type Request, type Response } from "express";
import { loadLocalEnv } from "./services/graphClient.js";

loadLocalEnv();
import { adminRouter } from "./routes/admin.js";
import { agendaRouter } from "./routes/agenda.js";
import { configRouter } from "./routes/config.js";
import { dieselSurchargeRouter } from "./routes/dieselSurcharge.js";
import { newsRouter } from "./routes/news.js";
import { prtgRouter } from "./routes/prtg.js";
import { waterLevelsRouter } from "./routes/waterLevels.js";

const port = 43124;
const app = express();

app.use((req, res, next) => {
  const started = Date.now();
  res.on("finish", () => {
    const path = req.originalUrl || req.url || "";
    const watched =
      path.startsWith("/api/waterlevels") ||
      path.startsWith("/api/dieselsurcharge") ||
      path.startsWith("/api/news") ||
      path.startsWith("/api/agenda") ||
      path.startsWith("/api/wij-agenda") ||
      path.startsWith("/api/prtg");
    if (!watched) return;
    const line = `${new Date().toISOString()} info api ${req.method} ${path} ${res.statusCode} ${Date.now() - started}ms`;
    if (res.statusCode >= 500) console.error(`[teunesen-tv] ${line}`);
    else console.log(`[teunesen-tv] ${line}`);
  });
  next();
});

app.use(express.json({ limit: "32kb" }));
app.use("/api/admin", adminRouter);
app.use("/api/config", configRouter);
app.use("/api/waterlevels", waterLevelsRouter);
app.use("/api/news", newsRouter);
app.use("/api/agenda", agendaRouter);
app.use("/api/wij-agenda", agendaRouter);
app.use("/api/dieselsurcharge", dieselSurchargeRouter);
app.use("/api/prtg", prtgRouter);

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const message = error instanceof Error ? error.message : "Onbekende serverfout.";
  console.error(`[teunesen-tv] ${new Date().toISOString()} error api ${message}`);
  if (!res.headersSent) res.status(500).json({ error: "Verzoek mislukt." });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`[teunesen-tv] ${new Date().toISOString()} info api luistert op http://127.0.0.1:${port}`);
});
