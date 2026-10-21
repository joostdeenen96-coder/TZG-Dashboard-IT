import { WeatherWidgetView } from "../components/InteractiveWeather";
import type { DashboardWidget } from "../types/dashboard";

type WeatherWidgetProps = {
  widget?: DashboardWidget;
};

export function WeatherWidget({ widget }: WeatherWidgetProps) {
  return <WeatherWidgetView settings={widget?.settings} />;
}
