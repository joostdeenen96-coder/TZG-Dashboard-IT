/**
 * Handmatige en geplande gasoliecontrole.
 * Zelfde service als GET /api/gasoil-surcharges. Geen credentials in de uitvoer.
 */
import { logInfo, logWarn } from "../log.js";
import { getGasOilSurcharges, isGasOilSourceOutage, type GasOilServiceDeps } from "./gasOilSurchargeService.js";
import type { GasOilSurchargeResult } from "./model.js";

export type GasOilCheckMonth = {
  applicableMonth: string | null;
  status: GasOilSurchargeResult["status"];
  referenceDate: string | null;
  surchargePerTon: number | null;
};

export type GasOilCheckReport = {
  status: "success" | "failed";
  nextInquiry: "open" | "closed";
  nl: { current: GasOilCheckMonth; next: GasOilCheckMonth };
  be: { current: GasOilCheckMonth; next: GasOilCheckMonth };
};

function monthView(result: GasOilSurchargeResult): GasOilCheckMonth {
  return {
    applicableMonth: result.applicableMonth,
    status: result.status,
    referenceDate: result.referenceDate,
    surchargePerTon: result.surchargePerTon,
  };
}

function logMonth(country: "NL" | "BE", current: GasOilSurchargeResult, next: GasOilSurchargeResult) {
  logInfo(`gasoil ${country} current/next result`, {
    event: `gasoil.check.${country.toLowerCase()}`,
    currentMonth: current.applicableMonth,
    currentStatus: current.status,
    currentSurcharge: current.surchargePerTon,
    nextMonth: next.applicableMonth,
    nextStatus: next.status,
    nextSurcharge: next.surchargePerTon,
  });
  for (const result of [current, next]) {
    if (result.status === "unavailable") {
      logWarn("gasoil source unavailable", {
        event: "gasoil.source.unavailable",
        country,
        applicableMonth: result.applicableMonth,
      });
    }
  }
}

export async function runGasOilCheck(deps: GasOilServiceDeps = {}): Promise<GasOilCheckReport> {
  const payload = await getGasOilSurcharges(deps);
  logMonth("NL", payload.nl.current, payload.nl.next);
  logMonth("BE", payload.be.current, payload.be.next);
  const outage = [payload.nl.current, payload.nl.next, payload.be.current, payload.be.next].some(
    (result) => result.message != null && isGasOilSourceOutage(result.message),
  );
  const report: GasOilCheckReport = {
    status: outage ? "failed" : "success",
    nextInquiry: payload.nextInquiry,
    nl: { current: monthView(payload.nl.current), next: monthView(payload.nl.next) },
    be: { current: monthView(payload.be.current), next: monthView(payload.be.next) },
  };
  logInfo("gasoil check completed", {
    event: "gasoil.check.completed",
    status: report.status,
    nextInquiry: report.nextInquiry,
  });
  return report;
}
