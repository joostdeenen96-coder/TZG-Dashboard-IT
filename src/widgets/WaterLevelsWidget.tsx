import { CardState } from "../components/CardState";
import { WaterLevelCard } from "../components/WaterLevelCard";
import { WidgetBoundary } from "../components/WidgetBoundary";
import { useWaterLevels } from "../services/waterLevelService";

export function WaterLevelsWidget() {
  const water = useWaterLevels();
  const levels = water.status === "ready" || water.status === "fallback" ? water.data : null;
  if (!levels) {
    return (
      <CardState
        className="h-full min-h-[200px]"
        status={water.status === "error" ? "error" : water.status === "empty" ? "empty" : "loading"}
        title="Waterstanden"
        message={
          water.status === "error"
            ? water.message
            : water.status === "empty"
              ? "Geen peilgegevens."
              : "Peilen worden opgehaald."
        }
      />
    );
  }
  return (
    <div className="grid h-full min-h-0 grid-cols-3 gap-4" data-water-grid="">
      <WidgetBoundary title={levels.maxau.name}>
        <WaterLevelCard station={levels.maxau} refreshing={water.refreshing} stale={water.status === "fallback"} />
      </WidgetBoundary>
      <WidgetBoundary title={levels.kaub.name}>
        <WaterLevelCard station={levels.kaub} refreshing={water.refreshing} stale={water.status === "fallback"} />
      </WidgetBoundary>
      <WidgetBoundary title={levels.ruhrort.name}>
        <WaterLevelCard station={levels.ruhrort} refreshing={water.refreshing} stale={water.status === "fallback"} />
      </WidgetBoundary>
    </div>
  );
}
