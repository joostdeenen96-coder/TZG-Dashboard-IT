import type { DashboardDefinition } from "../types/dashboard";

export type CachedPlayerConfig = {
  version: 1;
  savedAt: string;
  appVersion: string;
  heartbeatIntervalSeconds: number;
  screen: { id: string; name: string; slug: string; location: string };
  dashboard: DashboardDefinition;
};

const TOKENISH = /tzg_[A-Za-z0-9_-]{8,}|Bearer\s+\S+|GRAPH_CLIENT_SECRET|postgresql:\/\//i;

export function nextBackoff(current: number, cap = 60_000) {
  return Math.min(Math.max(current, 2_000) * 2, cap);
}

export function cacheKeyFromToken(token: string) {
  let hash = 0;
  for (let index = 0; index < token.length; index += 1) {
    hash = (hash * 33 + token.charCodeAt(index)) >>> 0;
  }
  return `tzg-player-config:${hash.toString(16)}`;
}

export function sanitizeCache(input: CachedPlayerConfig): CachedPlayerConfig | null {
  const raw = JSON.stringify(input);
  if (TOKENISH.test(raw)) return null;
  if (!input.dashboard) return null;
  return {
    version: 1,
    savedAt: input.savedAt,
    appVersion: String(input.appVersion || "").slice(0, 40),
    heartbeatIntervalSeconds: input.heartbeatIntervalSeconds,
    screen: {
      id: input.screen.id,
      name: input.screen.name,
      slug: input.screen.slug,
      location: input.screen.location,
    },
    dashboard: input.dashboard,
  };
}

export function readPlayerCache(token: string): CachedPlayerConfig | null {
  try {
    const raw = localStorage.getItem(cacheKeyFromToken(token));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedPlayerConfig;
    return sanitizeCache(parsed);
  } catch {
    return null;
  }
}

export function writePlayerCache(token: string, value: CachedPlayerConfig) {
  const clean = sanitizeCache(value);
  if (!clean) return;
  localStorage.setItem(cacheKeyFromToken(token), JSON.stringify(clean));
}
