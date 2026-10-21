import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AdminPanel } from "../components/AdminPanel";
import { Header } from "../components/Header";
import { clearScreenReloadGuard } from "../components/ScreenGuard";
import { useAmsterdamNow } from "../hooks/useAmsterdamNow";
import { useAdminSession } from "../services/adminService";
import { fetchDashboardBySlug } from "../services/dashboardApi";
import { useIctTvStatus } from "../services/ictTvStatus";
import { useTvStatus } from "../services/tvStatus";
import type { DashboardDefinition, DashboardWidget, DashboardWidgetType } from "../types/dashboard";
import { RenderWidget } from "../widgets/WidgetRegistry";

type DisplayPageProps = {
  slug: string;
};

function readScale(width: number, height: number, stageW: number, stageH: number) {
  if (width < 1 || height < 1) return 1;
  return Math.min(width / stageW, height / stageH);
}

function enabledTypes(dashboard: DashboardDefinition) {
  const map = new Map<DashboardWidgetType, DashboardWidget>();
  for (const widget of dashboard.widgets) {
    if (widget.enabled) map.set(widget.type, widget);
  }
  return map;
}

function NotConfigured() {
  return (
    <div className="fixed inset-0 grid place-items-center bg-ink text-paper">
      <div className="px-8 text-center">
        <img src="/teunesen-logo.png" alt="Teunesen" className="mx-auto h-16 w-auto opacity-80" />
        <h1 className="mt-8 font-display text-[48px] font-semibold tracking-[-0.015em]">
          Dit scherm is niet geconfigureerd.
        </h1>
        <p className="mt-3 text-[20px] text-mist">Controleer de slug of activeer het dashboard in beheer.</p>
      </div>
    </div>
  );
}

function StageShell({
  stageWidth,
  stageHeight,
  children,
}: {
  stageWidth: number;
  stageHeight: number;
  children: ReactNode;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const update = () => {
      const rect = element.getBoundingClientRect();
      setScale(readScale(rect.width, rect.height, stageWidth, stageHeight));
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
  }, [stageWidth, stageHeight]);

  useEffect(() => {
    const id = window.setTimeout(() => clearScreenReloadGuard(), 20_000);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <div ref={frame} className="fixed inset-0 grid place-items-center overflow-hidden bg-ink">
      <div className="relative overflow-hidden" style={{ width: stageWidth * scale, height: stageHeight * scale }}>
        <div
          className="absolute top-0 left-0 box-border flex origin-top-left flex-col gap-4 bg-ink p-5"
          style={{ width: stageWidth, height: stageHeight, transform: `scale(${scale})` }}
        >
          <div className="glass-backdrop pointer-events-none absolute inset-0" />
          <div className="relative flex min-h-0 flex-1 flex-col gap-3">{children}</div>
        </div>
      </div>
    </div>
  );
}

function PlanningLayout({ dashboard }: { dashboard: DashboardDefinition }) {
  const now = useAmsterdamNow();
  const tv = useTvStatus();
  const authenticated = useAdminSession();
  const [adminOpen, setAdminOpen] = useState(false);
  const active = enabledTypes(dashboard);
  const water = active.get("waterlevels");
  const diesel = active.get("diesel");
  const news = active.get("news");
  const agenda = active.get("agenda");
  const weather = active.get("weather");

  return (
    <StageShell stageWidth={dashboard.layout.stageWidth} stageHeight={dashboard.layout.stageHeight}>
      <Header
        now={now}
        fetchedAt={tv.fetchedAt}
        refreshing={tv.refreshing}
        stale={tv.stale}
        adminLabel={authenticated ? "Instellingen" : "Inloggen"}
        onAdmin={() => setAdminOpen(true)}
        weatherSettings={weather?.settings}
      />
      {(water || diesel) && (
        <section className="grid h-[640px] shrink-0 grid-cols-4 gap-4">
          {water ? (
            <div className={diesel ? "col-span-3" : "col-span-4"}>
              <RenderWidget widget={water} />
            </div>
          ) : null}
          {diesel ? (
            <div className={water ? "col-span-1" : "col-span-4"}>
              <RenderWidget widget={diesel} />
            </div>
          ) : null}
        </section>
      )}
      {news ? (
        <section className="min-h-0 flex-1">
          <RenderWidget widget={news} />
        </section>
      ) : (
        <section className="min-h-0 flex-1" />
      )}
      {agenda ? (
        <section className="h-[118px] shrink-0">
          <RenderWidget widget={agenda} />
        </section>
      ) : null}
      {adminOpen ? <AdminPanel authenticated={authenticated} onClose={() => setAdminOpen(false)} /> : null}
    </StageShell>
  );
}

function IctLayout({ dashboard }: { dashboard: DashboardDefinition }) {
  const now = useAmsterdamNow();
  const tv = useIctTvStatus();
  const authenticated = useAdminSession();
  const [adminOpen, setAdminOpen] = useState(false);
  const active = enabledTypes(dashboard);
  const prtg = active.get("prtg");
  const news = active.get("news");
  const agenda = active.get("agenda");
  const weather = active.get("weather");

  return (
    <StageShell stageWidth={dashboard.layout.stageWidth} stageHeight={dashboard.layout.stageHeight}>
      <Header
        now={now}
        fetchedAt={tv.fetchedAt}
        refreshing={tv.refreshing}
        stale={tv.stale}
        adminLabel={authenticated ? "Instellingen" : "Inloggen"}
        onAdmin={() => setAdminOpen(true)}
        weatherSettings={weather?.settings}
      />
      {prtg ? (
        <section className="grid h-[640px] shrink-0 grid-cols-1 gap-4">
          <RenderWidget widget={prtg} />
        </section>
      ) : null}
      {news ? (
        <section className="min-h-0 flex-1">
          <RenderWidget widget={news} />
        </section>
      ) : (
        <section className="min-h-0 flex-1" />
      )}
      {agenda ? (
        <section className="h-[118px] shrink-0">
          <RenderWidget widget={agenda} />
        </section>
      ) : null}
      {adminOpen ? <AdminPanel authenticated={authenticated} onClose={() => setAdminOpen(false)} /> : null}
    </StageShell>
  );
}

function StackLayout({ dashboard }: { dashboard: DashboardDefinition }) {
  const now = useAmsterdamNow();
  const tv = useTvStatus();
  const authenticated = useAdminSession();
  const [adminOpen, setAdminOpen] = useState(false);
  const widgets = useMemo(
    () => dashboard.widgets.filter((item) => item.enabled).sort((a, b) => a.position.order - b.position.order),
    [dashboard.widgets],
  );
  const weather = widgets.find((item) => item.type === "weather");

  return (
    <StageShell stageWidth={dashboard.layout.stageWidth} stageHeight={dashboard.layout.stageHeight}>
      <Header
        now={now}
        fetchedAt={tv.fetchedAt}
        refreshing={tv.refreshing}
        stale={tv.stale}
        adminLabel={authenticated ? "Instellingen" : "Inloggen"}
        onAdmin={() => setAdminOpen(true)}
        weatherSettings={weather?.settings}
      />
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
        {widgets
          .filter((item) => item.type !== "weather" && item.type !== "clock")
          .map((widget) => (
            <section key={widget.id} className="min-h-0 shrink-0" style={{ flex: widget.layout.width === "full" ? "1 1 0" : "0 0 auto" }}>
              <RenderWidget widget={widget} />
            </section>
          ))}
      </div>
      {adminOpen ? <AdminPanel authenticated={authenticated} onClose={() => setAdminOpen(false)} /> : null}
    </StageShell>
  );
}

export function DisplayPage({ slug }: DisplayPageProps) {
  const [dashboard, setDashboard] = useState<DashboardDefinition | null | undefined>(undefined);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    setDashboard(undefined);
    setError(false);
    void fetchDashboardBySlug(slug)
      .then((item) => {
        if (!active) return;
        setDashboard(item);
      })
      .catch(() => {
        if (!active) return;
        setError(true);
        setDashboard(null);
      });
    return () => {
      active = false;
    };
  }, [slug]);

  if (dashboard === undefined) {
    return (
      <div className="fixed inset-0 grid place-items-center bg-ink text-mist">
        <p className="text-[22px]">Scherm laden…</p>
      </div>
    );
  }

  if (error || !dashboard || !dashboard.enabled) {
    return <NotConfigured />;
  }

  return <DashboardCanvas dashboard={dashboard} />;
}

export function DashboardCanvas({ dashboard }: { dashboard: DashboardDefinition }) {
  if (dashboard.layout.preset === "planning") return <PlanningLayout dashboard={dashboard} />;
  if (dashboard.layout.preset === "ict") return <IctLayout dashboard={dashboard} />;
  return <StackLayout dashboard={dashboard} />;
}
