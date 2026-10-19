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

export type DashboardWidgetType =
  | "waterlevels"
  | "diesel"
  | "weather"
  | "news"
  | "slideshow"
  | "clock"
  | "text"
  | "prtg"
  | "agenda";

export type DashboardWidget = {
  id: string;
  type: DashboardWidgetType;
  title: string;
  enabled: boolean;
  position: WidgetPosition;
  layout: WidgetLayout;
  dataSource: DataSourceRef;
  settings: Record<string, unknown>;
  refreshIntervalSeconds: number;
};

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

export type DashboardUpdateInput = Partial<DashboardCreateInput>;
