import { SlideshowCard } from "../components/SlideshowCard";
import { WidgetBoundary } from "../components/WidgetBoundary";

type SlideshowWidgetProps = {
  title: string;
};

export function SlideshowWidget({ title }: SlideshowWidgetProps) {
  return (
    <WidgetBoundary title={title} className="h-full min-h-[200px]">
      <SlideshowCard />
    </WidgetBoundary>
  );
}
