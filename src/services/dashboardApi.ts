import type { DashboardCreateInput, DashboardDefinition, DashboardUpdateInput } from "../types/dashboard";

const TOKEN_KEY = "teunesen-admin-token";

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

export async function fetchDashboards(): Promise<DashboardDefinition[]> {
  const response = await fetch("/api/dashboards", { headers: { ...authHeaders() } });
  if (!response.ok) throw new Error(await readError(response));
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== "object" || !("dashboards" in payload) || !Array.isArray(payload.dashboards)) {
    throw new Error("Ongeldig dashboardantwoord.");
  }
  return payload.dashboards as DashboardDefinition[];
}

export async function fetchDashboardBySlug(slug: string): Promise<DashboardDefinition | null> {
  const response = await fetch(`/api/dashboards/by-slug/${encodeURIComponent(slug)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as DashboardDefinition;
}

export async function fetchDashboardById(id: string): Promise<DashboardDefinition | null> {
  const response = await fetch(`/api/dashboards/${encodeURIComponent(id)}`, { headers: { ...authHeaders() } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as DashboardDefinition;
}

export async function createDashboard(input: DashboardCreateInput): Promise<DashboardDefinition> {
  const response = await fetch("/api/dashboards", {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders() },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as DashboardDefinition;
}

export async function updateDashboard(id: string, input: DashboardUpdateInput): Promise<DashboardDefinition> {
  const response = await fetch(`/api/dashboards/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "content-type": "application/json", ...authHeaders() },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as DashboardDefinition;
}

export async function deleteDashboard(id: string): Promise<void> {
  const response = await fetch(`/api/dashboards/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { ...authHeaders() },
  });
  if (!response.ok) throw new Error(await readError(response));
}

export async function duplicateDashboard(source: DashboardDefinition, name: string, slug: string) {
  return createDashboard({
    name,
    slug,
    description: source.description,
    enabled: source.enabled,
    theme: source.theme,
    layout: source.layout,
    widgets: source.widgets.map((widget, index) => ({
      ...widget,
      id: `${widget.type}-${Date.now()}-${index}`,
    })),
  });
}
