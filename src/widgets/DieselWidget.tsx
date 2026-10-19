import { DieselCard } from "../components/DieselCard";
import { WidgetBoundary } from "../components/WidgetBoundary";

export function DieselWidget() {
  return (
    <WidgetBoundary title="Dieseltoeslag" className="h-full min-h-[200px]">
      <DieselCard />
    </WidgetBoundary>
  );
}
