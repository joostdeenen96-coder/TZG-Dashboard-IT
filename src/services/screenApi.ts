import type { DashboardDefinition } from "../types/dashboard";

const TOKEN_KEY = "teunesen-admin-token";

export type ScreenRecord = {
  id: string;
  name: string;
  slug: string;
  location: string;
  enabled: boolean;
  dashboardId: string | null;
  dashboardName: string | null;
  dashboardSlug: string | null;
  lastSeenAt: string | null;
  status: "Online" | "Offline" | "Uitgeschakeld" | "Nooit verbonden";
  hasActiveToken: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AuditEntry = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  actor: string;
  details: Record<string, unknown>;
  createdAt: string;
};

function authHeaders(): Record<string, string> {
  const current = sessionStorage.getItem(TOKEN_KEY);
  return current ? { authorization: `Bearer ${current}` } : {};
}

async function readError(response: Response) {
  const payload: unknown = await response.json().catch(() => null);
  if (payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string") {
    return payload.error;
  }
  return `Antwoord ${response.status}.`;
}

export async function fetchScreens(): Promise<ScreenRecord[]> {
  const response = await fetch("/api/screens", { headers: authHeaders() });
  if (!response.ok) throw new Error(await readError(response));
  const payload = (await response.json()) as { screens: ScreenRecord[] };
  return payload.screens;
}

export async function createScreen(input: {
  name: string;
  slug: string;
  location: string;
  enabled: boolean;
  dashboardId: string | null;
}): Promise<ScreenRecord> {
  const response = await fetch("/api/screens", {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders() },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as ScreenRecord;
}

export async function updateScreen(
  id: string,
  input: Partial<{ name: string; slug: string; location: string; enabled: boolean; dashboardId: string | null }>,
): Promise<ScreenRecord> {
  const response = await fetch(`/api/screens/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "content-type": "application/json", ...authHeaders() },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as ScreenRecord;
}

export async function deleteScreen(id: string) {
  const response = await fetch(`/api/screens/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!response.ok) throw new Error(await readError(response));
}

export async function issueScreenToken(id: string) {
  const response = await fetch(`/api/screens/${encodeURIComponent(id)}/tokens`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as { token: string; tokenId: string; playerPath: string };
}

export async function revokeScreenTokens(id: string) {
  const response = await fetch(`/api/screens/${encodeURIComponent(id)}/tokens/revoke`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as { revoked: number };
}

export async function fetchAudit(): Promise<AuditEntry[]> {
  const response = await fetch("/api/audit", { headers: authHeaders() });
  if (!response.ok) throw new Error(await readError(response));
  const payload = (await response.json()) as { entries: AuditEntry[] };
  return payload.entries;
}

export type { DashboardDefinition };
