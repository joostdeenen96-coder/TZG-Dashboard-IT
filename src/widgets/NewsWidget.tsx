import { NewsCard } from "../components/NewsCard";
import { WidgetBoundary } from "../components/WidgetBoundary";

export function NewsWidget({ density = "regular" }: { density?: "regular" | "compact" }) {
  return (
    <WidgetBoundary title="WijTeunesen" className={density === "compact" ? "h-full min-h-0" : "h-full min-h-[180px]"}>
      <NewsCard density={density} />
    </WidgetBoundary>
  );
}
