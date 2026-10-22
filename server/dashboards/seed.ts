import { randomUUID } from "node:crypto";
import type { DashboardDefinition, DashboardWidget } from "./model.js";

function widget(
  partial: Omit<DashboardWidget, "id" | "settings" | "refreshIntervalSeconds"> & {
    id?: string;
    settings?: Record<string, unknown>;
    refreshIntervalSeconds?: number;
  },
): DashboardWidget {
  return {
    id: partial.id ?? randomUUID(),
    settings: partial.settings ?? {},
    refreshIntervalSeconds: partial.refreshIntervalSeconds ?? 300,
    ...partial,
  } as DashboardWidget;
}

export function createDefaultDashboards(now = new Date().toISOString()): DashboardDefinition[] {
  const planningWidgets: DashboardWidget[] = [
    widget({
      type: "weather",
      title: "Weer",
      enabled: true,
      position: { order: 10 },
      layout: { area: "header" },
      dataSource: { kind: "builtin", name: "weather" },
      settings: {
        popupEnabled: true,
        forecastDays: 7,
        popupAutoCloseSeconds: 60,
        showPrecipitation: true,
        showWind: true,
        showSunriseSunset: false,
      },
    }),
    widget({
      type: "clock",
      title: "Klok",
      enabled: true,
      position: { order: 20 },
      layout: { area: "header" },
      dataSource: { kind: "none" },
    }),
    widget({
      type: "waterlevels",
      title: "Waterstanden",
      enabled: true,
      position: { order: 30, row: 1, span: 3 },
      layout: { area: "main", width: "two-thirds" },
      dataSource: { kind: "builtin", name: "waterlevels" },
    }),
    widget({
      type: "diesel",
      title: "Brandstoftoeslag",
      enabled: true,
      position: { order: 40, row: 1, span: 1 },
      layout: { area: "main", width: "third" },
      dataSource: { kind: "builtin", name: "diesel" },
    }),
    widget({
      type: "news",
      title: "WijTeunesen",
      enabled: true,
      position: { order: 50, row: 2 },
      layout: { area: "main", width: "full" },
      dataSource: { kind: "builtin", name: "news" },
    }),
    widget({
      type: "agenda",
      title: "Agenda",
      enabled: true,
      position: { order: 60, row: 3 },
      layout: { area: "footer", width: "full" },
      dataSource: { kind: "builtin", name: "agenda" },
    }),
  ];

  const ictWidgets: DashboardWidget[] = [
    widget({
      type: "weather",
      title: "Weer",
      enabled: true,
      position: { order: 10 },
      layout: { area: "header" },
      dataSource: { kind: "builtin", name: "weather" },
      settings: {
        popupEnabled: true,
        forecastDays: 7,
        popupAutoCloseSeconds: 60,
        showPrecipitation: true,
        showWind: true,
        showSunriseSunset: false,
      },
    }),
    widget({
      type: "clock",
      title: "Klok",
      enabled: true,
      position: { order: 20 },
      layout: { area: "header" },
      dataSource: { kind: "none" },
    }),
    widget({
      type: "prtg",
      title: "PRTG",
      enabled: true,
      position: { order: 30, row: 1 },
      layout: { area: "main", width: "full" },
      dataSource: { kind: "builtin", name: "prtg" },
    }),
    widget({
      type: "news",
      title: "WijTeunesen",
      enabled: true,
      position: { order: 40, row: 2 },
      layout: { area: "main", width: "full" },
      dataSource: { kind: "builtin", name: "news" },
    }),
    widget({
      type: "agenda",
      title: "Agenda",
      enabled: true,
      position: { order: 50, row: 3 },
      layout: { area: "footer", width: "full" },
      dataSource: { kind: "builtin", name: "agenda" },
    }),
  ];

  return [
    {
      id: "dashboard-planning",
      name: "Planning",
      slug: "planning",
      description: "Waterstanden, dieseltoeslag, nieuws en agenda voor de planning-TV.",
      enabled: true,
      theme: { mode: "dark", glass: true },
      layout: { preset: "planning", stageWidth: 2560, stageHeight: 1440 },
      widgets: planningWidgets,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "dashboard-ict",
      name: "ICT",
      slug: "ict",
      description: "PRTG-monitoring met nieuws en agenda voor de ICT-TV.",
      enabled: true,
      theme: { mode: "dark", glass: true },
      layout: { preset: "ict", stageWidth: 2560, stageHeight: 1440 },
      widgets: ictWidgets,
      createdAt: now,
      updatedAt: now,
    },
  ];
}
