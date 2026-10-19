import { NewsCard } from "../components/NewsCard";
import { WidgetBoundary } from "../components/WidgetBoundary";

export function NewsWidget() {
  return (
    <WidgetBoundary title="WijTeunesen" className="h-full min-h-[180px]">
      <NewsCard />
    </WidgetBoundary>
  );
}
