export type WaterStationId = "kaub" | "ruhrort" | "maxau";

export type WaterStatus = "laag" | "normaal" | "hoog";

export type WaterTrend = "stijgend" | "dalend" | "gelijk";

export type WaterPoint = {
  timestamp: string;
  levelCm: number;
};

export type WaterForecastKind = "verwacht" | "inschatting";

export type WaterForecastPoint = WaterPoint & {
  kind: WaterForecastKind;
};

export type WaterForecastStatus = "ok" | "stale" | "unavailable";

export type WaterForecastClock = "absolute" | "shifted";

export type WaterStationResult = {
  id: WaterStationId;
  name: string;
  river: string;
  levelCm: number | null;
  changeCm: number | null;
  trend: WaterTrend | null;
  status: WaterStatus | null;
  updatedAt: string | null;
  source: string;
  series: WaterPoint[];
  forecast: WaterForecastPoint[];
  forecastError: string | null;
  /** Publicatietijd van de voorspelling, als de bron die levert. */
  forecastIssuedAt?: string | null;
  forecastValidFrom?: string | null;
  forecastValidTo?: string | null;
  forecastSource?: string | null;
  forecastStationId?: string | null;
  forecastStatus?: WaterForecastStatus | null;
  /** `absolute` = tijdstip is het voorspellingsmoment. `shifted` = PEGELONLINE-WV, weergave +24 uur. */
  forecastClock?: WaterForecastClock;
  graphPath: string | null;
  error: string | null;
};

export type WaterLevelsResponse = Record<WaterStationId, WaterStationResult>;

export interface WaterLevelProvider {
  getCurrentData(): Promise<WaterStationResult>;
}

export function trendFromChange(changeCm: number): WaterTrend {
  if (changeCm > 0) return "stijgend";
  if (changeCm < 0) return "dalend";
  return "gelijk";
}

export function failedStation(
  meta: { id: WaterStationId; name: string; river: string; source: string },
  error: unknown,
): WaterStationResult {
  const message = error instanceof Error && error.message ? error.message : "Bron niet bereikbaar.";
  return {
    id: meta.id,
    name: meta.name,
    river: meta.river,
    levelCm: null,
    changeCm: null,
    trend: null,
    status: null,
    updatedAt: null,
    source: meta.source,
    series: [],
    forecast: [],
    forecastError: null,
    graphPath: null,
    error: message,
  };
}
