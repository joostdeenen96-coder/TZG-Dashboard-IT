export type DashboardTheme = {
  mode: "dark" | "light";
  glass: boolean;
};

export type WidgetPosition = {
  order: number;
  row?: number;
  column?: number;
  span?: number;
};

export type WidgetLayout = {
  area: "header" | "main" | "footer" | "sidebar";
  width?: "full" | "half" | "third" | "two-thirds";
};

export type DataSourceRef =
  | { kind: "builtin"; name: "waterlevels" | "diesel" | "news" | "agenda" | "weather" | "prtg" | "none" }
  | { kind: "none" };

type WidgetBase = {
  id: string;
  title: string;
  enabled: boolean;
  position: WidgetPosition;
  layout: WidgetLayout;
  dataSource: DataSourceRef;
  settings: Record<string, unknown>;
  refreshIntervalSeconds: number;
};

export type WaterlevelsWidget = WidgetBase & { type: "waterlevels" };
export type DieselWidget = WidgetBase & { type: "diesel" };
export type WeatherWidget = WidgetBase & { type: "weather" };
export type NewsWidget = WidgetBase & { type: "news" };
export type SlideshowWidget = WidgetBase & { type: "slideshow" };
export type ClockWidget = WidgetBase & { type: "clock" };
export type TextWidget = WidgetBase & { type: "text" };
export type PrtgWidget = WidgetBase & { type: "prtg" };
export type AgendaWidget = WidgetBase & { type: "agenda" };

export type DashboardWidget =
  | WaterlevelsWidget
  | DieselWidget
  | WeatherWidget
  | NewsWidget
  | SlideshowWidget
  | ClockWidget
  | TextWidget
  | PrtgWidget
  | AgendaWidget;

export type DashboardWidgetType = DashboardWidget["type"];

export type DashboardLayout = {
  preset: "planning" | "ict" | "stack";
  stageWidth: number;
  stageHeight: number;
};

export type DashboardDefinition = {
  id: string;
  name: string;
  slug: string;
  description: string;
  enabled: boolean;
  theme: DashboardTheme;
  layout: DashboardLayout;
  widgets: DashboardWidget[];
  createdAt: string;
  updatedAt: string;
};

export type DashboardCreateInput = {
  name: string;
  slug: string;
  description?: string;
  enabled?: boolean;
  theme?: Partial<DashboardTheme>;
  layout?: Partial<DashboardLayout>;
  widgets?: DashboardWidget[];
};

export type DashboardUpdateInput = Partial<DashboardCreateInput> & {
  widgets?: DashboardWidget[];
};

export type DashboardStoreFile = {
  version: 1;
  dashboards: DashboardDefinition[];
};

export const WIDGET_TYPES: DashboardWidgetType[] = [
  "waterlevels",
  "diesel",
  "weather",
  "news",
  "slideshow",
  "clock",
  "text",
  "prtg",
  "agenda",
];

export class DashboardValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DashboardValidationError";
  }
}

function asObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string, max: number, required = true) {
  if (typeof value !== "string") {
    if (required) throw new DashboardValidationError(`${label} is verplicht.`);
    return "";
  }
  const trimmed = value.trim();
  if (required && !trimmed) throw new DashboardValidationError(`${label} is verplicht.`);
  if (trimmed.length > max) throw new DashboardValidationError(`${label} is te lang.`);
  return trimmed;
}

function bool(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function whole(value: unknown, label: string, min: number, max: number, fallback: number) {
  if (value === undefined || value === null || value === "") return fallback;
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new DashboardValidationError(`${label} moet een geheel getal van ${min} tot ${max} zijn.`);
  }
  return number;
}

function isoStamp(value: unknown, label: string) {
  const raw = text(value, label, 40);
  const time = Date.parse(raw);
  if (!Number.isFinite(time)) throw new DashboardValidationError(`${label} is geen geldig tijdstip.`);
  return new Date(time).toISOString();
}

function parseSlug(value: unknown) {
  const slug = text(value, "Slug", 64).toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new DashboardValidationError("Slug mag alleen kleine letters, cijfers en koppeltekens bevatten.");
  }
  return slug;
}

function parseTheme(value: unknown): DashboardTheme {
  const row = asObject(value) ?? {};
  const mode = row.mode === "light" ? "light" : "dark";
  return { mode, glass: bool(row.glass, true) };
}

function parseLayout(value: unknown): DashboardLayout {
  const row = asObject(value) ?? {};
  const preset = row.preset === "ict" || row.preset === "stack" ? row.preset : "planning";
  return {
    preset,
    stageWidth: whole(row.stageWidth, "Breedte", 800, 7680, 2560),
    stageHeight: whole(row.stageHeight, "Hoogte", 600, 4320, 1440),
  };
}

function parseDataSource(value: unknown): DataSourceRef {
  const row = asObject(value);
  if (!row || row.kind === "none") return { kind: "none" };
  if (row.kind !== "builtin") throw new DashboardValidationError("dataSource.kind is ongeldig.");
  const name = text(row.name, "dataSource.name", 40);
  const allowed = ["waterlevels", "diesel", "news", "agenda", "weather", "prtg", "none"] as const;
  if (!(allowed as readonly string[]).includes(name)) {
    throw new DashboardValidationError("dataSource.name is onbekend.");
  }
  return { kind: "builtin", name: name as (typeof allowed)[number] };
}

function parsePosition(value: unknown): WidgetPosition {
  const row = asObject(value) ?? {};
  return {
    order: whole(row.order, "position.order", 0, 10_000, 0),
    row: row.row === undefined ? undefined : whole(row.row, "position.row", 0, 100, 0),
    column: row.column === undefined ? undefined : whole(row.column, "position.column", 0, 100, 0),
    span: row.span === undefined ? undefined : whole(row.span, "position.span", 1, 12, 1),
  };
}

function parseWidgetLayout(value: unknown): WidgetLayout {
  const row = asObject(value) ?? {};
  const area =
    row.area === "header" || row.area === "footer" || row.area === "sidebar" || row.area === "main"
      ? row.area
      : "main";
  const width =
    row.width === "half" || row.width === "third" || row.width === "two-thirds" || row.width === "full"
      ? row.width
      : undefined;
  return { area, width };
}

function parseWidget(value: unknown): DashboardWidget {
  const row = asObject(value);
  if (!row) throw new DashboardValidationError("Widget is ongeldig.");
  const type = text(row.type, "Widget type", 40);
  if (!(WIDGET_TYPES as string[]).includes(type)) {
    throw new DashboardValidationError(`Onbekend widgettype: ${type}.`);
  }
  const settings = asObject(row.settings) ?? {};
  const base = {
    id: text(row.id, "Widget-id", 80),
    title: text(row.title, "Widget-titel", 120),
    enabled: bool(row.enabled, true),
    position: parsePosition(row.position),
    layout: parseWidgetLayout(row.layout),
    dataSource: parseDataSource(row.dataSource),
    settings,
    refreshIntervalSeconds: whole(row.refreshIntervalSeconds, "refreshIntervalSeconds", 15, 3600, 300),
  };
  return { ...base, type: type as DashboardWidgetType } as DashboardWidget;
}

export function parseDashboardDefinition(value: unknown): DashboardDefinition {
  const row = asObject(value);
  if (!row) throw new DashboardValidationError("Dashboard is ongeldig.");
  const widgetsRaw = Array.isArray(row.widgets) ? row.widgets : [];
  if (widgetsRaw.length > 50) throw new DashboardValidationError("Te veel widgets.");
  return {
    id: text(row.id, "Dashboard-id", 80),
    name: text(row.name, "Naam", 120),
    slug: parseSlug(row.slug),
    description: text(row.description, "Beschrijving", 500, false),
    enabled: bool(row.enabled, true),
    theme: parseTheme(row.theme),
    layout: parseLayout(row.layout),
    widgets: widgetsRaw.map(parseWidget).sort((a, b) => a.position.order - b.position.order),
    createdAt: isoStamp(row.createdAt, "createdAt"),
    updatedAt: isoStamp(row.updatedAt, "updatedAt"),
  };
}

export function parseDashboardStore(value: unknown): DashboardStoreFile {
  const row = asObject(value);
  if (!row) throw new DashboardValidationError("Dashboardbestand is ongeldig.");
  if (row.version !== 1) throw new DashboardValidationError("Onbekende dashboardbestand-versie.");
  if (!Array.isArray(row.dashboards)) throw new DashboardValidationError("dashboards moet een lijst zijn.");
  const dashboards = row.dashboards.map(parseDashboardDefinition);
  const slugs = new Set<string>();
  for (const item of dashboards) {
    if (slugs.has(item.slug)) throw new DashboardValidationError(`Dubbele slug: ${item.slug}.`);
    slugs.add(item.slug);
  }
  return { version: 1, dashboards };
}

export function parseDashboardCreateInput(value: unknown): DashboardCreateInput {
  const row = asObject(value);
  if (!row) throw new DashboardValidationError("Aanvraag is ongeldig.");
  return {
    name: text(row.name, "Naam", 120),
    slug: parseSlug(row.slug),
    description: text(row.description, "Beschrijving", 500, false),
    enabled: bool(row.enabled, true),
    theme: row.theme === undefined ? undefined : parseTheme(row.theme),
    layout: row.layout === undefined ? undefined : parseLayout(row.layout),
    widgets: row.widgets === undefined ? undefined : (Array.isArray(row.widgets) ? row.widgets : []).map(parseWidget),
  };
}

export function parseDashboardUpdateInput(value: unknown): DashboardUpdateInput {
  const row = asObject(value);
  if (!row) throw new DashboardValidationError("Aanvraag is ongeldig.");
  const next: DashboardUpdateInput = {};
  if ("name" in row) next.name = text(row.name, "Naam", 120);
  if ("slug" in row) next.slug = parseSlug(row.slug);
  if ("description" in row) next.description = text(row.description, "Beschrijving", 500, false);
  if ("enabled" in row) next.enabled = bool(row.enabled, true);
  if ("theme" in row) next.theme = parseTheme(row.theme);
  if ("layout" in row) next.layout = parseLayout(row.layout);
  if ("widgets" in row) {
    if (!Array.isArray(row.widgets)) throw new DashboardValidationError("widgets moet een lijst zijn.");
    next.widgets = row.widgets.map(parseWidget);
  }
  return next;
}
