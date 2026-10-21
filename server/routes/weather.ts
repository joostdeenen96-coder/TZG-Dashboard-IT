import { Router } from "express";
import { logError } from "../log.js";
import { getWeatherForecast } from "../services/weatherService.js";

export const weatherRouter = Router();

weatherRouter.get("/", async (req, res) => {
  try {
    const location = typeof req.query.location === "string" ? req.query.location : undefined;
    const forecast = await getWeatherForecast(location);
    res.setHeader("Cache-Control", "private, max-age=60");
    res.json(forecast);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Weer niet beschikbaar.";
    logError(`weer route mislukt (${message})`, { event: "weather.route" });
    res.status(502).json({ error: "Weer niet beschikbaar.", status: "unavailable" });
  }
});
