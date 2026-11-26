import type { PrtgAlarm, PrtgMetric } from "../types";

export type GaugeTone = "normal" | "attention" | "critical" | "unknown";

export function metricTone(metric: PrtgMetric | null): GaugeTone {
  if (!metric || metric.percent === null) return "unknown";
  if (metric.status === "down" || metric.status === "downPartial") return "critical";
  if (metric.status === "warning" || metric.status === "unusual" || metric.high) return "attention";
  if (metric.status === "up") return "normal";
  return "unknown";
}

export function percentLabel(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "Onbekend";
  return `${Math.round(value)}%`;
}

/** Hoogste bekende bezetting. Ontbrekende percentages blijven buiten de vergelijking. */
export function primaryVolume(storage: PrtgMetric[]) {
  const known = storage.filter((item) => item.percent !== null);
  const pool = known.length > 0 ? known : storage;
  return (
    pool
      .slice()
      .sort((left, right) => (right.percent ?? -1) - (left.percent ?? -1) || left.name.localeCompare(right.name, "nl"))[0] ??
    null
  );
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
