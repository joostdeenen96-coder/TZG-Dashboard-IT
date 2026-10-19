import { fetchBytes, fetchJson } from "../providers/http.js";
import { getDashboardRepository } from "../dashboards/repository.js";
import { getDashboardConfig } from "./dashboardConfig.js";
import { getGraphAccessToken, graphUrl, graphGet } from "./graphClient.js";
import { readAppVersion } from "../appPaths.js";
import { logWarn } from "../log.js";
import { getIntegrationSettings, sharePointGraphPath } from "./settingsService.js";

export type HealthStatus = "healthy" | "degraded" | "unhealthy";

export type SourceCheck = {
  id: string;
  name: string;
  status: HealthStatus;
  detail: string;
};

const PEGELONLINE = "https://www.pegelonline.wsv.de/webservices/rest-api/v2";
const KAUB = "1d26e504-7f9e-480a-b52c-5932be6549ab";
const RUHRORT = "c0f51e35-d0e8-4318-afaf-c5fcbc29f4c1";
const HVZ_STATION = "https://www.hvz.baden-wuerttemberg.de/js/hvz_peg_stmn.js";

async function probe(name: string, id: string, run: () => Promise<string>): Promise<SourceCheck> {
  try {
    const detail = await run();
    return { id, name, status: "healthy", detail };
  } catch (error) {
    const message = error instanceof Error ? error.message : "niet bereikbaar";
    logWarn(`health source ${id}: ${message.slice(0, 160)}`);
    return { id, name, status: "unhealthy", detail: "niet bereikbaar" };
  }
}

async function checkPegelonline(uuid: string, label: string, id: string) {
  return probe(label, id, async () => {
    const payload = await fetchJson(`${PEGELONLINE}/stations/${uuid}/W.json?includeCurrentMeasurement=true`);
    if (!payload || typeof payload !== "object") throw new Error("ongeldig antwoord");
    return "bereikbaar";
  });
}

async function checkHvz() {
  return probe("HVZ Maxau", "hvz-maxau", async () => {
    const bytes = await fetchBytes(HVZ_STATION);
    if (bytes.byteLength < 32) throw new Error("leeg antwoord");
    return "bereikbaar";
  });
}

async function checkGraph() {
  const settings = getIntegrationSettings().graph;
  if (!settings.tenantId || !settings.clientId || !settings.clientSecret) {
    return {
      id: "microsoft-graph",
      name: "Microsoft Graph",
      status: "unhealthy" as const,
      detail: "niet geconfigureerd",
    };
  }
  return probe("Microsoft Graph", "microsoft-graph", async () => {
    await getGraphAccessToken();
    return "token verkregen";
  });
}

async function checkSharePointDiesel() {
  const settings = getIntegrationSettings().graph;
  if (!settings.tenantId || !settings.clientId || !settings.clientSecret) {
    return {
      id: "sharepoint-diesel",
      name: "SharePoint dieselbron",
      status: "unhealthy" as const,
      detail: "Graph niet geconfigureerd",
    };
  }
  return probe("SharePoint dieselbron", "sharepoint-diesel", async () => {
    const config = getDashboardConfig().sharepointDiesel;
    const sitePath = sharePointGraphPath(config.siteUrl);
    const site = (await graphGet(graphUrl(`/sites${sitePath}`))) as { id?: string };
    if (!site?.id) throw new Error("site niet gevonden");
    return "site bereikbaar";
  });
}

export async function getHealth() {
  const version = readAppVersion();
  const dashboardRepo = await getDashboardRepository().health();
  const dashboardStatus: HealthStatus = dashboardRepo.ok ? "healthy" : "unhealthy";
  const status: HealthStatus = dashboardStatus === "healthy" ? "healthy" : "degraded";
  return {
    status,
    version,
    services: {
      api: "healthy" as const,
      configuration: "healthy" as const,
      dashboardRepository: dashboardStatus,
    },
  };
}

export async function getHealthSources() {
  const checks = await Promise.all([
    checkPegelonline(KAUB, "PEGELONLINE Kaub", "pegelonline-kaub"),
    checkPegelonline(RUHRORT, "PEGELONLINE Ruhrort", "pegelonline-ruhrort"),
    checkHvz(),
    checkGraph(),
    checkSharePointDiesel(),
  ]);
  const unhealthy = checks.filter((item) => item.status === "unhealthy").length;
  const status: HealthStatus = unhealthy === 0 ? "healthy" : unhealthy === checks.length ? "unhealthy" : "degraded";
  return {
    status,
    version: readAppVersion(),
    sources: checks,
  };
}
