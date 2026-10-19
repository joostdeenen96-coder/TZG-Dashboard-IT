import { PrtgAlarmsPanel } from "../components/PrtgAlarmsPanel";
import { PrtgServersPanel } from "../components/PrtgServersPanel";
import { WidgetBoundary } from "../components/WidgetBoundary";
import { usePrtg } from "../services/prtgService";
import type { PrtgResponse } from "../types";

function panelState(prtg: ReturnType<typeof usePrtg>) {
  if (prtg.status === "loading") return { status: "loading" as const, message: undefined, data: null };
  if (prtg.status === "error") return { status: "error" as const, message: prtg.message, data: null };
  if (prtg.status === "empty") {
    return { status: "empty" as const, message: "PRTG niet gekoppeld", data: null };
  }
  const data: PrtgResponse = prtg.data;
  if (!data.configured) {
    return { status: "error" as const, message: data.error || "PRTG niet gekoppeld", data };
  }
  if (!data.filterReady) {
    return {
      status: "empty" as const,
      message: data.error || "Geen PRTG-groep of tag ingesteld",
      data,
    };
  }
  if (data.error && data.alarms.length === 0 && data.servers.length === 0) {
    return { status: "error" as const, message: data.error, data };
  }
  return {
    status: prtg.status === "fallback" ? ("fallback" as const) : ("ready" as const),
    message: data.error || undefined,
    data,
  };
}

export function PrtgWidget() {
  const prtg = usePrtg();
  const panel = panelState(prtg);
  const alarms = panel.data?.alarms ?? [];
  const servers = panel.data?.servers ?? [];
  return (
    <div className="grid h-full min-h-[320px] grid-cols-[420px_minmax(0,1fr)] gap-4">
      <WidgetBoundary title="Storingen">
        <PrtgAlarmsPanel
          alarms={alarms}
          status={panel.status === "fallback" ? "ready" : panel.status}
          message={panel.message}
          refreshing={prtg.refreshing}
        />
      </WidgetBoundary>
      <WidgetBoundary title="Servers">
        <PrtgServersPanel
          servers={servers}
          status={panel.status === "fallback" ? "ready" : panel.status}
          message={panel.message}
          refreshing={prtg.refreshing}
        />
      </WidgetBoundary>
    </div>
  );
}
