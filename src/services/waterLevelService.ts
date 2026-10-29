import { useSyncExternalStore } from "react";
import type {
  WaterForecastPoint,
  WaterLevelsResponse,
  WaterPoint,
  WaterStationId,
  WaterStationResult,
  WaterLevelSeverity,
  WaterStatus,
  WaterTrend,
} from "../types";

import { createPollingFeed } from "./tvFeed";

const WATER_LEVELS_PATH = "/api/waterlevels";

const stationNames: Record<WaterStationId, string> = {
  kaub: "Kaub",
  ruhrort: "Ruhrort",
  maxau: "Maxau",
};

function isTrend(value: unknown): value is WaterTrend {
  return value === "stijgend" || value === "dalend" || value === "gelijk";
}

function isStatus(value: unknown): value is WaterStatus {
  return (
    value === "Extreem laag" ||
    value === "Zeer laag" ||
    value === "Laag" ||
    value === "Normaal" ||
    value === "Hoog" ||
    value === "Zeer hoog"
  );
}

function isSeverity(value: unknown): value is WaterLevelSeverity {
  return (
    value === "extreme-low" ||
    value === "very-low" ||
    value === "low" ||
    value === "normal" ||
    value === "high" ||
    value === "very-high"
  );
}

function text(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function failed(id: WaterStationId, message: string, row?: Record<string, unknown>): WaterStationResult {
  return {
    id,
    name: text(row?.name, stationNames[id]),
    river: text(row?.river, "Rijn"),
    levelCm: null,
    changeCm: null,
    trend: null,
    status: null,
    severity: null,
    updatedAt: null,
    source: text(row?.source, ""),
    series: [],
    forecast: [],
    forecastError: null,
    forecastIssuedAt: null,
    forecastValidFrom: null,
    forecastValidTo: null,
    forecastSource: null,
    forecastStationId: null,
    forecastStatus: null,
    graphPath: null,
    error: message,
  };
}

function seriesPoints(value: unknown): WaterPoint[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (typeof row.timestamp !== "string" || typeof row.levelCm !== "number" || !Number.isFinite(row.levelCm)) return [];
    return [{ timestamp: row.timestamp, levelCm: row.levelCm }];
  });
}

function forecastPoints(value: unknown): WaterForecastPoint[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (row.kind !== "verwacht" && row.kind !== "inschatting") return [];
    if (typeof row.timestamp !== "string" || typeof row.levelCm !== "number" || !Number.isFinite(row.levelCm)) return [];
    return [{ timestamp: row.timestamp, levelCm: row.levelCm, kind: row.kind }];
  });
}

function localGraphPath(value: unknown) {
  return typeof value === "string" && value.startsWith("/api/") ? value : null;
}

function normalizeStation(id: WaterStationId, value: unknown): WaterStationResult {
  if (!value || typeof value !== "object") return failed(id, "Peil niet beschikbaar.");
  const row = value as Record<string, unknown>;
  if (typeof row.error === "string" && row.error.trim()) return failed(id, row.error, row);
  if (
    typeof row.levelCm !== "number" ||
    typeof row.changeCm !== "number" ||
    !isTrend(row.trend) ||
    !isStatus(row.status) ||
    !isSeverity(row.severity) ||
    typeof row.updatedAt !== "string"
  ) {
    return failed(id, "Peil niet beschikbaar.", row);
  }
  return {
    id,
    name: text(row.name, stationNames[id]),
    river: text(row.river, "Rijn"),
    levelCm: row.levelCm,
    changeCm: row.changeCm,
    trend: row.trend,
    status: row.status,
    severity: row.severity,
    updatedAt: row.updatedAt,
    source: text(row.source, ""),
    series: seriesPoints(row.series),
    forecast: forecastPoints(row.forecast),
    forecastError: typeof row.forecastError === "string" && row.forecastError.trim() ? row.forecastError : null,
    forecastIssuedAt: typeof row.forecastIssuedAt === "string" ? row.forecastIssuedAt : null,
    forecastValidFrom: typeof row.forecastValidFrom === "string" ? row.forecastValidFrom : null,
    forecastValidTo: typeof row.forecastValidTo === "string" ? row.forecastValidTo : null,
    forecastSource: typeof row.forecastSource === "string" ? row.forecastSource : null,
    forecastStationId: typeof row.forecastStationId === "string" ? row.forecastStationId : null,
    forecastStatus:
      row.forecastStatus === "ok" || row.forecastStatus === "stale" || row.forecastStatus === "unavailable"
        ? row.forecastStatus
        : null,
    forecastClock: row.forecastClock === "absolute" || row.forecastClock === "shifted" ? row.forecastClock : undefined,
    graphPath: localGraphPath(row.graphPath),
    error: null,
  };
}

function mapPayload(payload: unknown): WaterLevelsResponse | "empty" {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Waterstanden hebben een ongeldig formaat.");
  }
  const record = payload as Record<string, unknown>;
  if (Object.keys(record).length === 0) return "empty";
  if (!("kaub" in record) || !("ruhrort" in record) || !("maxau" in record)) {
    throw new Error("Waterstanden hebben een ongeldig formaat.");
  }
  return {
    kaub: normalizeStation("kaub", record.kaub),
    ruhrort: normalizeStation("ruhrort", record.ruhrort),
    maxau: normalizeStation("maxau", record.maxau),
  };
}

async function loadWaterLevels(signal: AbortSignal): Promise<WaterLevelsResponse | "empty"> {
  const response = await fetch(WATER_LEVELS_PATH, { signal });
  if (!response.ok) throw new Error(`Waterstanden antwoordden met ${response.status}.`);
  return mapPayload(await response.json());
}

function acceptWater(value: unknown): WaterLevelsResponse | null {
  try {
    const mapped = mapPayload(value);
    return mapped === "empty" ? null : mapped;
  } catch {
    return null;
  }
}

const waterFeed = createPollingFeed<WaterLevelsResponse>({
  name: "waterstanden",
  storageKey: "teunesen.tv.water.v2",
  unavailable: "Waterstanden niet bereikbaar.",
  load: loadWaterLevels,
  accept: acceptWater,
});

export function useWaterLevels() {
  return useSyncExternalStore(waterFeed.subscribe, waterFeed.getSnapshot, waterFeed.getSnapshot);
}
