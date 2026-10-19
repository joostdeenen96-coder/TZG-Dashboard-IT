type TextWidgetProps = {
  title: string;
  settings: Record<string, unknown>;
};

export function TextWidget({ title, settings }: TextWidgetProps) {
  const body = typeof settings.body === "string" ? settings.body : typeof settings.text === "string" ? settings.text : "";
  return (
    <div className="tv-card flex h-full min-h-[120px] flex-col px-5 py-4">
      <h2 className="font-display text-[28px] leading-none font-semibold tracking-[-0.015em]">{title}</h2>
      <p className="mt-3 whitespace-pre-wrap text-[20px] leading-relaxed text-paper/90">{body || "Geen tekst."}</p>
    </div>
  );
}
