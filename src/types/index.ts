export type WaterStatus = "laag" | "normaal" | "hoog";

export type WaterTrend = "stijgend" | "dalend" | "gelijk";

export type WaterStationId = "kaub" | "ruhrort" | "maxau";

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
  forecastIssuedAt?: string | null;
  forecastValidFrom?: string | null;
  forecastValidTo?: string | null;
  forecastSource?: string | null;
  forecastStationId?: string | null;
  forecastStatus?: WaterForecastStatus | null;
  forecastClock?: WaterForecastClock;
  graphPath: string | null;
  error: string | null;
};

export type WijNewsItem = {
  id: string;
  title: string;
  category: string;
  summary: string;
  publishedAt: string;
  imagePath: string | null;
};

export type WijNewsResponse = {
  site: string;
  source: "WijTeunesen";
  connected: boolean;
  items: WijNewsItem[];
  error: string | null;
};

export type WijAgendaItem = {
  id: string;
  title: string;
  location: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
};

export type WijAgendaResponse = {
  site: string;
  source: "WijTeunesen";
  connected: boolean;
  items: WijAgendaItem[];
  error: string | null;
};

export type WaterLevelsResponse = Record<WaterStationId, WaterStationResult>;

export type QueryState<T> =
  | { status: "loading"; refreshing: boolean; fetchedAt: string | null }
  | { status: "error"; message: string; refreshing: boolean; fetchedAt: string | null }
  | { status: "empty"; refreshing: boolean; fetchedAt: string | null }
  | { status: "ready"; data: T; refreshing: boolean; fetchedAt: string | null }
  | { status: "fallback"; data: T; message: string; refreshing: boolean; fetchedAt: string | null };

export type DieselWeek = {
  itemId?: string;
  peildatum: string;
  /** SharePoint WebsiteWeek — zichtbaar weeknummer. */
  websiteWeek: number;
  dieselPrijs: number | null;
  /** Weergave: Math.floor(raw). */
  toeslagPercentage: number;
  toeslagPercentageRaw: number;
  toeslagPercentageDisplay: number;
  /** Informatief; niet gebruikt voor Planning-selectie. */
  actief: boolean;
};

export type DieselSurcharge = DieselWeek & {
  /** Nieuwste peildatum eerst, daarna een-na-nieuwste. */
  weken: DieselWeek[];
};

export type WeatherIconName = "cloud" | "rain" | "showers" | "sun" | "sun-cloud";

export type ForecastDay = {
  day: string;
  icon: WeatherIconName;
  highC: number;
  lowC: number;
  condition: string;
};

export type WeatherReport = {
  location: string;
  temperatureC: number;
  feelsLikeC: number;
  condition: string;
  summary: string;
  icon: WeatherIconName;
  wind: string;
  humidityPct: number;
  forecast: ForecastDay[];
};

export type ProjectSlide = {
  id: string;
  title: string;
  location: string;
  url: string;
  gradient: string;
  objectPosition: string;
};

export type PrtgAlarmStatus = "warning" | "down" | "unusual" | "downPartial" | "downAcknowledged";

export type PrtgSensorStatus =
  | "up"
  | "warning"
  | "down"
  | "unusual"
  | "downPartial"
  | "downAcknowledged"
  | "unknown";

export type PrtgAlarm = {
  id: string;
  device: string;
  sensor: string;
  status: PrtgAlarmStatus;
  message: string;
  acknowledged: boolean;
  group: string;
  lastvalue: string;
  sinceLabel: string | null;
  sinceAt: string | null;
  suggestion: string | null;
};

export type PrtgMetric = {
  sensorId: string;
  name: string;
  percent: number | null;
  status: PrtgSensorStatus;
  high: boolean;
};

export type PrtgServer = {
  id: string;
  name: string;
  cpu: PrtgMetric | null;
  memory: PrtgMetric | null;
  storage: PrtgMetric[];
};

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
