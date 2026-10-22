import { DieselCard } from "../components/DieselCard";
import { WidgetBoundary } from "../components/WidgetBoundary";

export function DieselWidget() {
  return (
    <WidgetBoundary title="Brandstoftoeslag" className="h-full min-h-0">
      <DieselCard />
    </WidgetBoundary>
  );
}
