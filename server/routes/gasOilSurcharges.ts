import { Router } from "express";
import { getGasOilSurcharges } from "../gasoil/gasOilSurchargeService.js";

export const gasOilSurchargesRouter = Router();

gasOilSurchargesRouter.get("/", async (_req, res) => {
  try {
    res.json(await getGasOilSurcharges());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gasolietoeslag niet beschikbaar.";
    console.error(`[teunesen-tv] ${new Date().toISOString()} error gasolietoeslag ${message}`);
    res.status(502).json({ error: message });
  }
});
