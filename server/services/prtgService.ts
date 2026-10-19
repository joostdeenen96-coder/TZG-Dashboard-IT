import {
  fetchPrtgSnapshot,
  filterIsSet,
  readPrtgCredentials,
  type PrtgAlarm,
  type PrtgFilter,
  type PrtgServer,
  type PrtgSnapshot,
} from "../providers/prtgProvider.js";
import { getDashboardConfig } from "./dashboardConfig.js";
import { getIntegrationSettings } from "./settingsService.js";

const REFRESH_MS = 60_000;

export type PrtgResponse = {
  connected: boolean;
  configured: boolean;
  filterReady: boolean;
  source: "PRTG";
  fetchedAt: string | null;
  error: string | null;
  alarms: PrtgAlarm[];
  servers: PrtgServer[];
};

type Cache = {
  fetchedAt: number;
  payload: PrtgResponse;
};

let cache: Cache | null = null;
let inFlight: Promise<PrtgResponse> | null = null;
let lastGood: Cache | null = null;

function envText(name: string) {
  return process.env[name]?.trim() ?? "";
}

function currentFilter(): PrtgFilter {
  const stored = getIntegrationSettings().prtg;
  const prtg = getDashboardConfig().prtg;
  // Volgorde: beheerpanel → .env → config.json
  return {
    groupId: stored.groupId.trim() || envText("PRTG_GROUP_ID") || prtg.groupId.trim(),
    tag: stored.tag.trim() || envText("PRTG_TAG") || prtg.tag.trim(),
  };
}

export function resetPrtgCache() {
  cache = null;
  inFlight = null;
}

function emptyResponse(partial: Partial<PrtgResponse> & { error: string | null }): PrtgResponse {
  return {
    connected: false,
    configured: false,
    filterReady: false,
    source: "PRTG",
    fetchedAt: null,
    alarms: [],
    servers: [],
    ...partial,
  };
}

function fromSnapshot(snapshot: PrtgSnapshot, configured: boolean, filterReady: boolean, fetchedAt: string): PrtgResponse {
  return {
    connected: true,
    configured,
    filterReady,
    source: "PRTG",
    fetchedAt,
    error: null,
    alarms: snapshot.alarms,
    servers: snapshot.servers,
  };
}

async function loadFresh(): Promise<PrtgResponse> {
  const stored = getIntegrationSettings().prtg;
  const credentials = readPrtgCredentials({
    baseUrl: stored.baseUrl,
    username: stored.username,
    password: stored.password,
  });
  const filter = currentFilter();
  const filterReady = filterIsSet(filter);
  if (!credentials) {
    return emptyResponse({
      configured: false,
      filterReady,
      error: "PRTG niet gekoppeld",
    });
  }
  if (!filterReady) {
    return emptyResponse({
      connected: true,
      configured: true,
      filterReady: false,
      fetchedAt: new Date().toISOString(),
      error: "Geen PRTG-groep of tag ingesteld",
    });
  }
  try {
    const snapshot = await fetchPrtgSnapshot(credentials, filter);
    return fromSnapshot(snapshot, true, true, new Date().toISOString());
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : "PRTG niet bereikbaar.";
    if (lastGood) {
      return {
        ...lastGood.payload,
        error: message,
      };
    }
    return emptyResponse({
      configured: true,
      filterReady: true,
      error: message,
    });
  }
}

export async function getPrtgDashboard(): Promise<PrtgResponse> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < REFRESH_MS) {
    return cache.payload;
  }
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const payload = await loadFresh();
    const stamp = Date.now();
    cache = { fetchedAt: stamp, payload };
    if (payload.connected && !payload.error) {
      lastGood = { fetchedAt: stamp, payload };
    } else if (payload.alarms.length > 0 || payload.servers.length > 0) {
      lastGood = { fetchedAt: stamp, payload };
    }
    return payload;
  })();
  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}
