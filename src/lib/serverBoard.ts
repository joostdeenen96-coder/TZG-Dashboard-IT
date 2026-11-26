import type { PrtgAlarm, PrtgMetric, PrtgServer } from "../types";

export type GaugeTone = "normal" | "attention" | "critical" | "unusual" | "unknown";

/** 0 = Down/Error, 1 = resource-Warning, 2 = andere Warning, 3 = Unusual, 4 = normaal. */
export type ServerPriorityRank = 0 | 1 | 2 | 3 | 4;

export function metricTone(metric: PrtgMetric | null): GaugeTone {
  if (!metric) return "unknown";
  if (metric.status === "down" || metric.status === "downPartial") return "critical";
  if (metric.status === "warning") return "attention";
  if (metric.status === "unusual") return "unusual";
  if (metric.percent === null) return "unknown";
  if (metric.status === "up") return "normal";
  return "unknown";
}

export function percentLabel(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "Onbekend";
  return `${Math.round(value)}%`;
}

function volumeRank(status: PrtgMetric["status"]) {
  if (status === "down" || status === "downPartial") return 0;
  if (status === "warning") return 1;
  if (status === "unusual") return 2;
  if (status === "up") return 3;
  return 4;
}

/** Slechtste PRTG-status, en bij gelijke status de hoogste bezetting. Een leeg percentage telt niet als 0. */
export function primaryVolume(storage: PrtgMetric[]) {
  const known = storage.filter((item) => item.percent !== null);
  const pool = known.length > 0 ? known : storage;
  return (
    pool
      .slice()
      .sort(
        (left, right) =>
          volumeRank(left.status) - volumeRank(right.status) ||
          (right.percent ?? -1) - (left.percent ?? -1) ||
          left.name.localeCompare(right.name, "nl"),
      )[0] ?? null
  );
}

/** Korte schijfnaam voor de kaart. Serienummers en labels blijven in de detailpopup. */
export function compactVolumeName(name: string) {
  const drive = name.match(/\b([A-Za-z]):\\?/);
  if (drive?.[1]) return `${drive[1].toUpperCase()}:`;
  const stripped = name
    .replace(/serial number.*/i, "")
    .replace(/label:.*/i, "")
    .replace(/disk free:?/i, "")
    .replace(/\s+/g, " ")
    .trim();
  const head = stripped.split(/[,|/]/)[0]?.trim() || name.trim();
  return head.length > 14 ? `${head.slice(0, 12)}…` : head;
}

export function deviceKey(value: string) {
  return value.trim().toLowerCase().replace(/\.teunesen\.local$/i, "").replace(/\.local$/i, "");
}

function alarmRank(status: PrtgAlarm["status"]) {
  if (status === "down") return 0;
  if (status === "downPartial") return 1;
  if (status === "warning") return 2;
  if (status === "unusual") return 3;
  return 4;
}

/** Gepauzeerde sensoren zitten niet in deze lijst. Bevestigde storingen tellen niet als open incident. */
export function openAlarms(alarms: PrtgAlarm[], serverName: string) {
  const key = deviceKey(serverName);
  return alarms
    .filter((alarm) => {
      if (alarm.acknowledged || alarm.status === "downAcknowledged") return false;
      const device = deviceKey(alarm.device);
      return device === key || device.includes(key) || key.includes(device);
    })
    .sort((left, right) => {
      const byStatus = alarmRank(left.status) - alarmRank(right.status);
      if (byStatus !== 0) return byStatus;
      return Date.parse(right.sinceAt ?? "") - Date.parse(left.sinceAt ?? "");
    });
}

export function alarmCounts(alarms: PrtgAlarm[]) {
  return {
    warnings: alarms.filter((alarm) => alarm.status === "warning" || alarm.status === "unusual").length,
    errors: alarms.filter((alarm) => alarm.status === "down" || alarm.status === "downPartial").length,
  };
}

function resourceMetrics(server: PrtgServer) {
  return [server.cpu, server.memory, ...server.storage].filter((item): item is PrtgMetric => item !== null);
}

function isDown(status: string) {
  return status === "down" || status === "downPartial";
}

/**
 * Prioriteit uit de PRTG-status. Een hoog percentage zonder Warning/Down blijft normaal.
 * Gepauzeerde sensoren komen niet in de alarmlijst en tellen dus niet mee.
 */
export function getServerPriority(server: PrtgServer, alarms: PrtgAlarm[]): ServerPriorityRank {
  const metrics = resourceMetrics(server);
  const incidents = openAlarms(alarms, server.name);
  if (metrics.some((metric) => isDown(metric.status)) || incidents.some((alarm) => isDown(alarm.status))) return 0;
  if (metrics.some((metric) => metric.status === "warning")) return 1;
  if (incidents.some((alarm) => alarm.status === "warning")) return 2;
  if (metrics.some((metric) => metric.status === "unusual") || incidents.some((alarm) => alarm.status === "unusual")) return 3;
  return 4;
}

export function priorityReason(server: PrtgServer, alarms: PrtgAlarm[]) {
  const rank = getServerPriority(server, alarms);
  if (rank === 0) return "down";
  if (rank === 1) return "resource-warning";
  if (rank === 2) return "warning";
  if (rank === 3) return "unusual";
  return "normal";
}

/** Hoogste bekende percentage. Ontbrekende metrics tellen niet als 0; alles onbekend geeft null. */
export function getResourceLoadScore(server: PrtgServer): number | null {
  const values = [server.cpu, server.memory, ...server.storage]
    .map((metric) => metric?.percent)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  if (values.length === 0) return null;
  return Math.max(...values);
}

function compareLoad(left: number | null, right: number | null) {
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return right - left;
}

/**
 * PRTG-status eerst, daarna de hoogste bekende belasting, daarna de oorspronkelijke volgorde.
 * Het meegegeven array blijft ongewijzigd.
 */
export function sortServersByPriority<T extends PrtgServer>(servers: T[], alarms: PrtgAlarm[]) {
  return servers
    .map((server, index) => ({
      server,
      index,
      priority: getServerPriority(server, alarms),
      score: getResourceLoadScore(server),
    }))
    .sort(
      (left, right) =>
        left.priority - right.priority || compareLoad(left.score, right.score) || left.index - right.index,
    )
    .map((item) => item.server);
}

export const RESOURCE_PAGE_SIZE = 9;

export function paginateServers<T>(servers: readonly T[], pageSize = RESOURCE_PAGE_SIZE) {
  if (pageSize < 1) return [servers.slice()];
  const pages: T[][] = [];
  for (let index = 0; index < servers.length; index += pageSize) {
    pages.push(servers.slice(index, index + pageSize));
  }
  return pages;
}

export function clampPage(page: number, pageCount: number) {
  if (pageCount <= 1) return 0;
  return Math.min(Math.max(0, page), pageCount - 1);
}

/** Handmatige stap. Pagina 1 + links en de laatste pagina + rechts lopen rond. */
export function stepServerPage(current: number, pageCount: number, delta: number) {
  if (pageCount <= 1) return 0;
  const base = clampPage(current, pageCount);
  return (base + delta + pageCount) % pageCount;
}

/** 16:9-schermen blijven op 3 kolommen. Smallere viewports mogen terug naar 2 of 1. */
export function resourceColumnCount(viewportWidth: number) {
  if (viewportWidth < 700) return 1;
  if (viewportWidth < 1100) return 2;
  return 3;
}

/** Resources toont één pagina van 9 kaarten. Op 16:9 is dat 3×3, zonder vierde rij. */
export function visibleResourceCards(viewportWidth: number, viewportHeight: number) {
  const columns = resourceColumnCount(viewportWidth);
  const scale = Math.min(viewportWidth / 2560, viewportHeight / 1440);
  const rows = columns === 3 ? 3 : Math.ceil(RESOURCE_PAGE_SIZE / columns);
  return { columns, rows, visible: RESOURCE_PAGE_SIZE, pageSize: RESOURCE_PAGE_SIZE, scale };
}
