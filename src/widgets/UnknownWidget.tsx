import { CardState } from "../components/CardState";

type UnknownWidgetProps = {
  type: string;
  title?: string;
};

export function UnknownWidget({ type, title }: UnknownWidgetProps) {
  return (
    <CardState
      className="h-full min-h-[120px]"
      status="error"
      title={title || "Widget"}
      message={`Onbekend widgettype: ${type}`}
    />
  );
}
