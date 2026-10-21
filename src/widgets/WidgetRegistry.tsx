import type { ComponentType } from "react";
import type { DashboardWidget, DashboardWidgetType } from "../types/dashboard";
import { AgendaWidget } from "./AgendaWidget";
import { ClockWidget } from "./ClockWidget";
import { DieselWidget } from "./DieselWidget";
import { NewsWidget } from "./NewsWidget";
import { PrtgWidget } from "./PrtgWidget";
import { SlideshowWidget } from "./SlideshowWidget";
import { TextWidget } from "./TextWidget";
import { UnknownWidget } from "./UnknownWidget";
import { WaterLevelsWidget } from "./WaterLevelsWidget";
import { WeatherWidget } from "./WeatherWidget";

type WidgetRendererProps = {
  widget: DashboardWidget;
};

type RegistryEntry = {
  type: DashboardWidgetType;
  component: ComponentType<WidgetRendererProps>;
};

const registry: RegistryEntry[] = [
  { type: "waterlevels", component: () => <WaterLevelsWidget /> },
  { type: "diesel", component: () => <DieselWidget /> },
  { type: "weather", component: ({ widget }) => <WeatherWidget widget={widget} /> },
  { type: "news", component: () => <NewsWidget /> },
  { type: "slideshow", component: ({ widget }) => <SlideshowWidget title={widget.title} /> },
  { type: "clock", component: () => <ClockWidget /> },
  { type: "text", component: ({ widget }) => <TextWidget title={widget.title} settings={widget.settings} /> },
  { type: "prtg", component: () => <PrtgWidget /> },
  { type: "agenda", component: () => <AgendaWidget /> },
];

const byType = new Map(registry.map((entry) => [entry.type, entry.component]));

const warned = new Set<string>();

export function resolveWidgetComponent(type: string): ComponentType<WidgetRendererProps> {
  const known = byType.get(type as DashboardWidgetType);
  if (known) return known;
  if (!warned.has(type)) {
    warned.add(type);
    console.warn(`[WidgetRegistry] Onbekend widgettype: ${type}`);
  }
  return ({ widget }) => <UnknownWidget type={type} title={widget.title} />;
}

export function RenderWidget({ widget }: WidgetRendererProps) {
  if (!widget.enabled) return null;
  const Component = resolveWidgetComponent(widget.type);
  return <Component widget={widget} />;
}

export function listRegisteredWidgetTypes(): DashboardWidgetType[] {
  return registry.map((entry) => entry.type);
}
