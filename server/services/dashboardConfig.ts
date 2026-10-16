import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const configFile = path.join(root, "config.json");

export const GRAPH_TENANT_ID = "ca0e0118-1eb1-4661-bd22-8ca64479f1d3";

export type DashboardConfig = {
  sharepointDiesel: {
    siteUrl: string;
    lijstnaam: string;
  };
  sharepointNieuws: {
    siteUrl: string;
    bibliotheek: string;
  };
  weer: {
    plaatsnaam: string;
  };
  dashboard: {
    refreshInterval: number;
    aantalNieuwsitems: number;
  };
  prtg: {
    groupId: string;
    tag: string;
  };
};

export type ScreenConfig = Pick<DashboardConfig, "weer" | "dashboard">;

const DEFAULTS: DashboardConfig = {
  sharepointDiesel: {
    siteUrl: "https://teunesen.sharepoint.com/sites/Facturatie",
    lijstnaam: "Dieseltoeslagen Asvervoer",
  },
  sharepointNieuws: {
    siteUrl: "https://teunesen.sharepoint.com/sites/wt-nieuws",
    bibliotheek: "Sitepagina's",
  },
  weer: {
    plaatsnaam: "Gennep",
  },
  dashboard: {
    refreshInterval: 300,
    aantalNieuwsitems: 5,
  },
  prtg: {
    groupId: "",
    tag: "",
  },
};

function asObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function sharePointUrl(value: unknown, label: string) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new Error(`${label} is verplicht.`);
  if (text.length > 200) throw new Error(`${label} is te lang.`);
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new Error(`${label} is geen geldig adres.`);
  }
  if (url.protocol !== "https:" || !url.hostname.endsWith(".sharepoint.com")) {
    throw new Error(`${label} moet een https-adres op sharepoint.com zijn.`);
  }
  const pathname = url.pathname.replace(/\/$/, "") || "/";
  return `${url.origin}${pathname}`;
}

function plainName(value: unknown, label: string, max: number) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new Error(`${label} is verplicht.`);
  if (text.length > max) throw new Error(`${label} is te lang.`);
  if (!/^[\p{L}\p{N} ._'’-]+$/u.test(text)) throw new Error(`${label} bevat een teken dat niet mag.`);
  return text;
}

function wholeNumber(value: unknown, label: string, min: number, max: number) {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new Error(`${label} moet een geheel getal van ${min} tot ${max} zijn.`);
  }
  return number;
}

function optionalToken(value: unknown, label: string, max: number) {
  if (value === undefined || value === null) return "";
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return "";
  if (text.length > max) throw new Error(`${label} is te lang.`);
  if (!/^[\p{L}\p{N} ._'@:+#-]+$/u.test(text)) throw new Error(`${label} bevat een teken dat niet mag.`);
  return text;
}

export function parseDashboardConfig(value: unknown): DashboardConfig {
  const body = asObject(value);
  const diesel = asObject(body.sharepointDiesel);
  const nieuws = asObject(body.sharepointNieuws);
  const weer = asObject(body.weer);
  const dashboard = asObject(body.dashboard);
  const prtg = asObject(body.prtg);
  return {
    sharepointDiesel: {
      siteUrl: sharePointUrl(diesel.siteUrl, "Site URL van de dieseltoeslag"),
      lijstnaam: plainName(diesel.lijstnaam, "Lijstnaam", 80),
    },
    sharepointNieuws: {
      siteUrl: sharePointUrl(nieuws.siteUrl, "Site URL van het nieuws"),
      bibliotheek: plainName(nieuws.bibliotheek, "Bibliotheek", 80),
    },
    weer: {
      plaatsnaam: plainName(weer.plaatsnaam, "Plaatsnaam", 60),
    },
    dashboard: {
      refreshInterval: wholeNumber(dashboard.refreshInterval, "Refresh interval", 15, 3600),
      aantalNieuwsitems: wholeNumber(dashboard.aantalNieuwsitems, "Aantal nieuwsitems", 1, 5),
    },
    prtg: {
      groupId: optionalToken(prtg.groupId, "PRTG-groep", 40),
      tag: optionalToken(prtg.tag, "PRTG-tag", 80),
    },
  };
}

export function getDashboardConfig(): DashboardConfig {
  try {
    return parseDashboardConfig(JSON.parse(readFileSync(configFile, "utf8")));
  } catch (error) {
    if (error instanceof Error && error.message && !String(error).includes("ENOENT")) {
      console.error(`config.json is ongeldig (${error.message}). Standaardinstellingen worden gebruikt.`);
    }
    return {
      sharepointDiesel: { ...DEFAULTS.sharepointDiesel },
      sharepointNieuws: { ...DEFAULTS.sharepointNieuws },
      weer: { ...DEFAULTS.weer },
      dashboard: { ...DEFAULTS.dashboard },
      prtg: { ...DEFAULTS.prtg },
    };
  }
}

export function getScreenConfig(): ScreenConfig {
  const config = getDashboardConfig();
  return { weer: config.weer, dashboard: config.dashboard };
}

export function saveDashboardConfig(value: unknown): DashboardConfig {
  const config = parseDashboardConfig(value);
  mkdirSync(path.dirname(configFile), { recursive: true });
  writeFileSync(configFile, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  return config;
}
