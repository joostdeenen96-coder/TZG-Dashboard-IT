import type { ServerResourceResponse } from "../types/serverResources";

const statuses = new Set(["hit", "miss", "stale", "unavailable"]);

export async function loadServerResources(serverId: string, signal?: AbortSignal): Promise<ServerResourceResponse> {
  const response = await fetch(`/api/ict/servers/${encodeURIComponent(serverId)}/resources`, { signal, cache: "no-store" });
  if (!response.ok) throw new Error("Servergegevens tijdelijk niet beschikbaar");
  const payload = (await response.json()) as Partial<ServerResourceResponse>;
  if (payload.source !== "PRTG" || typeof payload.cacheStatus !== "string" || !statuses.has(payload.cacheStatus)) {
    throw new Error("Servergegevens tijdelijk niet beschikbaar");
  }
  return {
    source: "PRTG",
    retrievedAt: typeof payload.retrievedAt === "string" ? payload.retrievedAt : null,
    cacheStatus: payload.cacheStatus,
    staleReason: typeof payload.staleReason === "string" ? payload.staleReason : null,
    error: typeof payload.error === "string" ? payload.error : null,
    server: payload.server ?? null,
  };
}
