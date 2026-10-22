import { useSyncExternalStore } from "react";

const TOKEN_KEY = "teunesen-admin-token";

export type PublicSettings = {
  graph: {
    tenantId: string;
    clientId: string;
    clientSecretSet: boolean;
  };
  sharepoint: {
    siteUrl: string;
    listName: string;
  };
  prtg: {
    baseUrl: string;
    username: string;
    passwordSet: boolean;
    groupId: string;
    tag: string;
  };
};

let authenticated = false;
const listeners = new Set<() => void>();

function publish(next: boolean) {
  authenticated = next;
  for (const listener of listeners) listener();
}

function token() {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function adminAuthHeaders(): Record<string, string> {
  const current = token();
  return current ? { authorization: `Bearer ${current}` } : {};
}

function authHeaders(): Record<string, string> {
  return adminAuthHeaders();
}

async function readError(response: Response) {
  const payload: unknown = await response.json().catch(() => null);
  if (payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string") {
    return payload.error;
  }
  return `Antwoord ${response.status}.`;
}

export async function refreshAdminSession() {
  if (!token()) {
    publish(false);
    return false;
  }
  const response = await fetch("/api/admin/session", { headers: authHeaders() });
  const payload: unknown = await response.json().catch(() => null);
  const ok = Boolean(
    payload && typeof payload === "object" && "authenticated" in payload && payload.authenticated === true,
  );
  if (!ok) sessionStorage.removeItem(TOKEN_KEY);
  publish(ok);
  return ok;
}

export async function loginAdmin(username: string, password: string) {
  const response = await fetch("/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) throw new Error(await readError(response));
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== "object" || !("token" in payload) || typeof payload.token !== "string") {
    throw new Error("Aanmelden gaf geen sessie.");
  }
  sessionStorage.setItem(TOKEN_KEY, payload.token);
  publish(true);
}

export async function logoutAdmin() {
  await fetch("/api/admin/logout", { method: "POST", headers: authHeaders() }).catch(() => undefined);
  sessionStorage.removeItem(TOKEN_KEY);
  publish(false);
}

function normalizePublicSettings(value: unknown): PublicSettings {
  const row = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const graph = row.graph && typeof row.graph === "object" ? (row.graph as Record<string, unknown>) : {};
  const sharepoint =
    row.sharepoint && typeof row.sharepoint === "object" ? (row.sharepoint as Record<string, unknown>) : {};
  const prtg = row.prtg && typeof row.prtg === "object" ? (row.prtg as Record<string, unknown>) : {};
  return {
    graph: {
      tenantId: typeof graph.tenantId === "string" ? graph.tenantId : "",
      clientId: typeof graph.clientId === "string" ? graph.clientId : "",
      clientSecretSet: graph.clientSecretSet === true,
    },
    sharepoint: {
      siteUrl: typeof sharepoint.siteUrl === "string" ? sharepoint.siteUrl : "",
      listName: typeof sharepoint.listName === "string" ? sharepoint.listName : "",
    },
    prtg: {
      baseUrl: typeof prtg.baseUrl === "string" ? prtg.baseUrl : "",
      username: typeof prtg.username === "string" ? prtg.username : "Beheert",
      passwordSet: prtg.passwordSet === true,
      groupId: typeof prtg.groupId === "string" ? prtg.groupId : "",
      tag: typeof prtg.tag === "string" ? prtg.tag : "",
    },
  };
}

export async function fetchSettings(): Promise<PublicSettings> {
  const response = await fetch("/api/admin/settings", { headers: authHeaders() });
  if (!response.ok) throw new Error(await readError(response));
  return normalizePublicSettings(await response.json());
}

export async function saveSettings(input: {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  siteUrl: string;
  listName: string;
  newPassword: string;
  prtgBaseUrl: string;
  prtgUsername: string;
  prtgPassword: string;
  prtgGroupId: string;
  prtgTag: string;
}) {
  const response = await fetch("/api/admin/settings", {
    method: "PUT",
    headers: { "content-type": "application/json", ...authHeaders() },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await readError(response));
  const settings = normalizePublicSettings(await response.json());
  // Oude API zonder prtg-velden: opslaan is dan niet echt gelukt voor PRTG.
  if (!settings.prtg.baseUrl && !settings.prtg.groupId && !settings.prtg.passwordSet && input.prtgGroupId) {
    throw new Error("De API is verouderd. Stop Teunesen API, doe git pull, en start start-dashboard opnieuw.");
  }
  return settings;
}

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

function isDashboardConfig(value: unknown): value is DashboardConfig {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  const diesel = row.sharepointDiesel;
  const nieuws = row.sharepointNieuws;
  const weer = row.weer;
  const dashboard = row.dashboard;
  const prtg = row.prtg;
  if (!diesel || typeof diesel !== "object" || !nieuws || typeof nieuws !== "object") return false;
  if (!weer || typeof weer !== "object" || !dashboard || typeof dashboard !== "object") return false;
  if (!prtg || typeof prtg !== "object") return false;
  const dieselRow = diesel as Record<string, unknown>;
  const nieuwsRow = nieuws as Record<string, unknown>;
  const weerRow = weer as Record<string, unknown>;
  const dashboardRow = dashboard as Record<string, unknown>;
  const prtgRow = prtg as Record<string, unknown>;
  return (
    typeof dieselRow.siteUrl === "string" &&
    typeof dieselRow.lijstnaam === "string" &&
    typeof nieuwsRow.siteUrl === "string" &&
    typeof nieuwsRow.bibliotheek === "string" &&
    typeof weerRow.plaatsnaam === "string" &&
    typeof dashboardRow.refreshInterval === "number" &&
    typeof dashboardRow.aantalNieuwsitems === "number" &&
    typeof prtgRow.groupId === "string" &&
    typeof prtgRow.tag === "string"
  );
}

export async function fetchDashboardConfig() {
  const response = await fetch("/api/admin/config", { headers: authHeaders() });
  if (!response.ok) throw new Error(await readError(response));
  const payload: unknown = await response.json();
  if (!isDashboardConfig(payload)) throw new Error("Instellingen hebben een ongeldig formaat.");
  return payload;
}

export async function saveDashboardConfig(config: DashboardConfig) {
  const response = await fetch("/api/admin/config", {
    method: "PUT",
    headers: { "content-type": "application/json", ...authHeaders() },
    body: JSON.stringify(config),
  });
  if (!response.ok) throw new Error(await readError(response));
  const payload: unknown = await response.json();
  if (!isDashboardConfig(payload)) throw new Error("Instellingen hebben een ongeldig formaat.");
  return payload;
}

export async function testDashboardConnection(config: DashboardConfig) {
  const response = await fetch("/api/admin/test", {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders() },
    body: JSON.stringify(config),
  });
  if (!response.ok) throw new Error(await readError(response));
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== "object" || !("message" in payload) || typeof payload.message !== "string") {
    throw new Error("Test gaf geen resultaat.");
  }
  return payload.message;
}

export async function testAdminConnection() {
  const response = await fetch("/api/admin/test", { method: "POST", headers: authHeaders() });
  if (!response.ok) throw new Error(await readError(response));
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== "object" || !("message" in payload) || typeof payload.message !== "string") {
    throw new Error("Test gaf geen resultaat.");
  }
  return payload.message;
}

export type GasOilBootstrapPreview = {
  country: "NL";
  referenceDate: string;
  applicableMonth: string;
  applicableMonthLabel: string;
  sourcePricePer100Liters: number;
  priceExVatPer1000Liters: number;
  staffelRange: { from: number; to: number } | null;
  surchargePerTon: number;
  sourceNote: string;
  alreadyExists: boolean;
};

export async function previewGasOilBootstrap(input: {
  country: string;
  referenceDate: string;
  pricePer100Liters: string;
  sourceNote: string;
}): Promise<GasOilBootstrapPreview> {
  const response = await fetch("/api/admin/gasoil/bootstrap/preview", {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders() },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as GasOilBootstrapPreview;
}

export async function commitGasOilBootstrap(input: {
  country: string;
  referenceDate: string;
  pricePer100Liters: string;
  sourceNote: string;
}) {
  const response = await fetch("/api/admin/gasoil/bootstrap", {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders() },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}

export async function runGasOilCaptureNow() {
  const response = await fetch("/api/admin/gasoil/capture-now", {
    method: "POST",
    headers: authHeaders(),
  });
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}

export function useAdminSession() {
  return useSyncExternalStore(
    (onStoreChange) => {
      listeners.add(onStoreChange);
      return () => listeners.delete(onStoreChange);
    },
    () => authenticated,
    () => false,
  );
}

void refreshAdminSession();
