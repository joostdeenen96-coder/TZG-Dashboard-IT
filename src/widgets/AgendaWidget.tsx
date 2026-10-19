import { AgendaBar } from "../components/AgendaBar";
import { WidgetBoundary } from "../components/WidgetBoundary";

export function AgendaWidget() {
  return (
    <WidgetBoundary title="Agenda" className="h-full min-h-[100px]">
      <AgendaBar />
    </WidgetBoundary>
  );
}
