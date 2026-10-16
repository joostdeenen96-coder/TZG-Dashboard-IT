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

function authHeaders(): Record<string, string> {
  const current = token();
  return current ? { authorization: `Bearer ${current}` } : {};
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

export async function fetchSettings(): Promise<PublicSettings> {
  const response = await fetch("/api/admin/settings", { headers: authHeaders() });
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as PublicSettings;
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
  return (await response.json()) as PublicSettings;
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
