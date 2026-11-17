import { getPrtgDashboard } from "./prtgService.js";
import { queryPrtgTable, readPrtgCredentials, type PrtgCredentials } from "../providers/prtgProvider.js";
import { getIntegrationSettings } from "./settingsService.js";
import { createResourceCache, type CacheStatus } from "../prtg/resourceCache.js";
import {
  normalizeServerResources,
  redactSecrets,
  sensorCategory,
  type ProbeChannel,
  type ProbeDevice,
  type ProbeSensor,
  type ServerResourceDetails,
} from "../prtg/resourceModel.js";
import type { SourceCheck } from "./healthService.js";

const SERVER_ID = /^[a-z0-9][a-z0-9._ -]{0,180}$/i;
const CHANNEL_LIMIT = 30;

export type ServerResourceResponse = {
  source: "PRTG";
  retrievedAt: string | null;
  cacheStatus: CacheStatus;
  staleReason: string | null;
  error: string | null;
  server: ServerResourceDetails | null;
};

let probe: SourceCheck = {
  id: "server-resources",
  name: "PRTG serverdetails",
  status: "disabled",
  detail: "nog niet opgevraagd",
  lastChecked: new Date(0).toISOString(),
};

export function getServerResourceProbe(): SourceCheck {
  return probe;
}

export function isServerResourceId(value: string) {
  return SERVER_ID.test(value.trim());
}

function note(status: SourceCheck["status"], detail: string) {
  probe = { id: "server-resources", name: "PRTG serverdetails", status, detail, lastChecked: new Date().toISOString() };
}

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

async function table(credentials: PrtgCredentials, params: Record<string, string>, key: string) {
  const payload = await queryPrtgTable(credentials, params);
  const row = asRecord(payload);
  const list = row?.[key];
  return Array.isArray(list) ? list : [];
}

function deviceFrom(row: Record<string, unknown>): ProbeDevice {
  return {
    name: text(row.device) || text(row.name),
    host: text(row.host),
    group: text(row.group),
    statusCode: numberValue(row.status_raw) ?? numberValue(row.status),
    message: redactSecrets(text(row.message)),
  };
}

function sensorFrom(row: Record<string, unknown>, channels: ProbeChannel[]): ProbeSensor | null {
  const id = text(row.objid) || text(row.objid_raw);
  const device = text(row.device);
  const name = text(row.sensor);
  if (!id || !device || !name) return null;
  return {
    id,
    device,
    name,
    type: text(row.type) || text(row.type_raw),
    tags: text(row.tags),
    statusCode: numberValue(row.status_raw) ?? numberValue(row.status),
    message: redactSecrets(text(row.message)),
    lastvalue: redactSecrets(text(row.lastvalue)),
    group: text(row.group),
    lastcheck: text(row.lastcheck) || text(row.lastcheck_raw),
    channels: channels.map((channel) => ({ name: channel.name, lastvalue: redactSecrets(channel.lastvalue) })),
  };
}

async function channelsFor(credentials: PrtgCredentials, sensorId: string): Promise<ProbeChannel[]> {
  const list = await table(credentials, { content: "channels", id: sensorId, columns: "name,lastvalue", count: "40" }, "channels");
  return list.flatMap((item) => {
    const row = asRecord(item);
    if (!row) return [];
    const name = text(row.name);
    if (!name) return [];
    return [{ name, lastvalue: text(row.lastvalue) }];
  });
}

async function mapLimit<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>) {
  const results: R[] = new Array(items.length);
  let index = 0;
  async function next() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await worker(items[current]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => next()));
  return results;
}

async function loadServer(serverId: string): Promise<ServerResourceDetails> {
  const stored = getIntegrationSettings().prtg;
  const credentials = readPrtgCredentials({ baseUrl: stored.baseUrl, username: stored.username, password: stored.password });
  if (!credentials) throw new Error("PRTG niet gekoppeld");
  const dashboard = await getPrtgDashboard();
  const known = dashboard.servers.find((server) => server.id === serverId.toLowerCase());
  const deviceName = known?.name || serverId;
  const [deviceRows, sensorRows] = await Promise.all([
    table(
      credentials,
      { content: "devices", columns: "objid,device,host,group,status,message", filter_device: deviceName, count: "5" },
      "devices",
    ),
    table(
      credentials,
      {
        content: "sensors",
        columns: "objid,device,sensor,status,message,lastvalue,type,tags,group,lastcheck",
        filter_device: deviceName,
        count: "500",
      },
      "sensors",
    ),
  ]);
  const device = deviceRows
    .map(asRecord)
    .find((row): row is Record<string, unknown> => Boolean(row && text(row.device).toLowerCase() === deviceName.toLowerCase()));
  const preliminary = sensorRows.flatMap((item) => {
    const row = asRecord(item);
    return row ? [sensorFrom(row, [])].filter((sensor): sensor is ProbeSensor => sensor !== null) : [];
  });
  const interesting = preliminary.filter((sensor) => sensorCategory(sensor.type, sensor.name)).slice(0, CHANNEL_LIMIT);
  const channelMap = new Map<string, ProbeChannel[]>();
  await mapLimit(interesting, 4, async (sensor) => {
    try {
      channelMap.set(sensor.id, await channelsFor(credentials, sensor.id));
    } catch {
      channelMap.set(sensor.id, []);
    }
  });
  const sensors = preliminary.map((sensor) => ({ ...sensor, channels: channelMap.get(sensor.id) ?? [] }));
  const details = normalizeServerResources(serverId.toLowerCase(), device ? deviceFrom(device) : null, sensors, new Date().toISOString());
  if (!details) throw new Error("Server niet gevonden in PRTG.");
  return details;
}

const cache = createResourceCache<ServerResourceDetails>({ load: loadServer });

export async function getServerResources(serverId: string): Promise<ServerResourceResponse> {
  const id = serverId.trim().toLowerCase();
  if (!isServerResourceId(id)) {
    return { source: "PRTG", retrievedAt: null, cacheStatus: "unavailable", staleReason: null, error: "Onbekende server.", server: null };
  }
  const result = await cache.read(id);
  if (result.cacheStatus === "unavailable" || !result.value) {
    const reason = result.staleReason || "niet beschikbaar";
    note(reason === "PRTG niet gekoppeld" ? "disabled" : "unavailable", reason);
    return {
      source: "PRTG",
      retrievedAt: null,
      cacheStatus: "unavailable",
      staleReason: result.staleReason,
      error: "Servergegevens tijdelijk niet beschikbaar",
      server: null,
    };
  }
  note(result.cacheStatus === "stale" ? "stale" : "healthy", result.cacheStatus === "stale" ? "laatste geldige meting" : "bijgewerkt");
  return {
    source: "PRTG",
    retrievedAt: result.value.retrievedAt,
    cacheStatus: result.cacheStatus,
    staleReason: result.staleReason,
    error: result.cacheStatus === "stale" ? "Gegevens tijdelijk niet vernieuwd" : null,
    server: result.value,
  };
}
