import { useSyncExternalStore } from "react";
import type {
  PrtgAlarm,
  PrtgAlarmStatus,
  PrtgMetric,
  PrtgResponse,
  PrtgSensorStatus,
  PrtgServer,
} from "../types";
import { cleanPrtgText } from "../lib/format";
import { createPollingFeed } from "./tvFeed";

const PRTG_PATH = "/api/prtg";
const PRTG_REFRESH_MS = 60_000;

const alarmStatuses = new Set<PrtgAlarmStatus>([
  "warning",
  "down",
  "unusual",
  "downPartial",
  "downAcknowledged",
]);

const sensorStatuses = new Set<PrtgSensorStatus>([
  "up",
  "warning",
  "down",
  "unusual",
  "downPartial",
  "downAcknowledged",
  "unknown",
]);

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function percent(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, value));
}

function asAlarmStatus(value: unknown): PrtgAlarmStatus | null {
  return typeof value === "string" && alarmStatuses.has(value as PrtgAlarmStatus)
    ? (value as PrtgAlarmStatus)
    : null;
}

function asSensorStatus(value: unknown): PrtgSensorStatus {
  return typeof value === "string" && sensorStatuses.has(value as PrtgSensorStatus)
    ? (value as PrtgSensorStatus)
    : "unknown";
}

function normalizeMetric(value: unknown): PrtgMetric | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const sensorId = text(row.sensorId);
  const name = text(row.name);
  if (!sensorId || !name) return null;
  return {
    sensorId,
    name,
    percent: percent(row.percent),
    status: asSensorStatus(row.status),
    high: row.high === true,
  };
}

function normalizeAlarm(value: unknown): PrtgAlarm | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const status = asAlarmStatus(row.status);
  const id = text(row.id);
  const device = text(row.device);
  const sensor = text(row.sensor);
  if (!status || !id || !device || !sensor) return null;
  return {
    id,
    device,
    sensor,
    status,
    message: cleanPrtgText(text(row.message)),
    acknowledged: row.acknowledged === true || status === "downAcknowledged",
    group: text(row.group),
    lastvalue: cleanPrtgText(text(row.lastvalue)),
    sinceLabel: text(row.sinceLabel) || null,
    sinceAt: text(row.sinceAt) || null,
    suggestion: text(row.suggestion) || null,
  };
}

function normalizeServer(value: unknown): PrtgServer | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = text(row.id);
  const name = text(row.name);
  if (!id || !name) return null;
  const storage = Array.isArray(row.storage)
    ? row.storage.map(normalizeMetric).filter((item): item is PrtgMetric => item !== null)
    : [];
  return {
    id,
    name,
    cpu: normalizeMetric(row.cpu),
    memory: normalizeMetric(row.memory),
    storage,
  };
}

function mapPayload(payload: unknown): PrtgResponse | "empty" {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("PRTG heeft een ongeldig formaat.");
  }
  const row = payload as Record<string, unknown>;
  const alarms = Array.isArray(row.alarms)
    ? row.alarms.map(normalizeAlarm).filter((item): item is PrtgAlarm => item !== null)
    : [];
  const servers = Array.isArray(row.servers)
    ? row.servers.map(normalizeServer).filter((item): item is PrtgServer => item !== null)
    : [];
  const error = text(row.error) || null;
  return {
    connected: row.connected === true,
    configured: row.configured === true,
    filterReady: row.filterReady === true,
    source: "PRTG",
    fetchedAt: typeof row.fetchedAt === "string" ? row.fetchedAt : null,
    error,
    alarms,
    servers,
  };
}

async function loadPrtg(signal: AbortSignal): Promise<PrtgResponse | "empty"> {
  const response = await fetch(PRTG_PATH, { signal });
  if (!response.ok) throw new Error(`PRTG antwoordde met ${response.status}.`);
  return mapPayload(await response.json());
}

function acceptPrtg(value: unknown): PrtgResponse | null {
  try {
    const mapped = mapPayload(value);
    return mapped === "empty" ? null : mapped;
  } catch {
    return null;
  }
}

const prtgFeed = createPollingFeed<PrtgResponse>({
  name: "prtg",
  storageKey: "teunesen.tv.prtg.v1",
  unavailable: "PRTG niet bereikbaar.",
  load: loadPrtg,
  accept: acceptPrtg,
  refreshMs: PRTG_REFRESH_MS,
});

export function usePrtg() {
  return useSyncExternalStore(prtgFeed.subscribe, prtgFeed.getSnapshot, prtgFeed.getSnapshot);
}
