import { useEffect, useRef, useState } from "react";
import { AdminPanel } from "../components/AdminPanel";
import { AgendaBar } from "../components/AgendaBar";
import { Header } from "../components/Header";
import { NewsCard } from "../components/NewsCard";
import { PrtgAlarmsPanel } from "../components/PrtgAlarmsPanel";
import { PrtgServersPanel } from "../components/PrtgServersPanel";
import { clearScreenReloadGuard } from "../components/ScreenGuard";
import { WidgetBoundary } from "../components/WidgetBoundary";
import { useAmsterdamNow } from "../hooks/useAmsterdamNow";
import { useAdminSession } from "../services/adminService";
import { useIctTvStatus } from "../services/ictTvStatus";
import { usePrtg } from "../services/prtgService";
import type { PrtgResponse } from "../types";

const STAGE_WIDTH = 2560;
const STAGE_HEIGHT = 1440;

function readScale(width: number, height: number) {
  if (width < 1 || height < 1) return 1;
  return Math.min(width / STAGE_WIDTH, height / STAGE_HEIGHT);
}

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

export function IctDashboardPage() {
  const now = useAmsterdamNow();
  const frame = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const prtg = usePrtg();
  const tv = useIctTvStatus();
  const authenticated = useAdminSession();
  const [adminOpen, setAdminOpen] = useState(false);
  const panel = panelState(prtg);
  const alarms = panel.data?.alarms ?? [];
  const servers = panel.data?.servers ?? [];

  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const update = () => {
      const rect = element.getBoundingClientRect();
      setScale(readScale(rect.width, rect.height));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => clearScreenReloadGuard(), 20_000);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <div ref={frame} className="fixed inset-0 grid place-items-center overflow-hidden bg-ink">
      <div className="relative overflow-hidden" style={{ width: STAGE_WIDTH * scale, height: STAGE_HEIGHT * scale }}>
        <div
          className="absolute top-0 left-0 box-border flex h-[1440px] w-[2560px] origin-top-left flex-col gap-4 bg-ink p-5"
          style={{ transform: `scale(${scale})` }}
        >
          <div className="glass-backdrop pointer-events-none absolute inset-0" />
          <div className="relative flex min-h-0 flex-1 flex-col gap-3">
            <Header
              now={now}
              fetchedAt={tv.fetchedAt}
              refreshing={tv.refreshing}
              stale={tv.stale}
              adminLabel={authenticated ? "Instellingen" : "Inloggen"}
              onAdmin={() => setAdminOpen(true)}
            />
            <section className="grid h-[640px] shrink-0 grid-cols-5 gap-4">
              <WidgetBoundary title="Storingen" className="col-span-2">
                <PrtgAlarmsPanel
                  alarms={alarms}
                  status={panel.status === "fallback" ? "ready" : panel.status}
                  message={panel.message}
                  refreshing={prtg.refreshing}
                />
              </WidgetBoundary>
              <WidgetBoundary title="Servers" className="col-span-3">
                <PrtgServersPanel
                  servers={servers}
                  status={panel.status === "fallback" ? "ready" : panel.status}
                  message={panel.message}
                  refreshing={prtg.refreshing}
                />
              </WidgetBoundary>
            </section>
            <section className="min-h-0 flex-1">
              <WidgetBoundary title="WijTeunesen">
                <NewsCard />
              </WidgetBoundary>
            </section>
            <section className="h-[118px] shrink-0">
              <WidgetBoundary title="Agenda">
                <AgendaBar />
              </WidgetBoundary>
            </section>
            {adminOpen ? <AdminPanel authenticated={authenticated} onClose={() => setAdminOpen(false)} /> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
