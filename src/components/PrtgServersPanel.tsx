import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";
import type { PrtgAlarm, PrtgMetric, PrtgServer } from "../types";
import { formatAmsterdamTime } from "../lib/format";
import {
  alarmCounts,
  clampPage,
  openAlarms,
  paginateServers,
  primaryVolume,
  RESOURCE_PAGE_SIZE,
  sortServersByPriority,
  stepServerPage,
} from "../lib/serverBoard";
import { CardState } from "./CardState";
import { ServerResourceBoard } from "./ServerResourceBoard";
import { ServerResourceDialog } from "./ServerResourceDialog";

type PrtgServersPanelProps = {
  servers: PrtgServer[];
  alarms?: PrtgAlarm[];
  fetchedAt?: string | null;
  stale?: boolean;
  status: "loading" | "error" | "empty" | "ready" | "fallback";
  message?: string;
  refreshing?: boolean;
  initialView?: "overview" | "resources";
  initialPage?: number;
};

function shortName(value: string) {
  return value.replace(/\.teunesen\.local$/i, "").replace(/\.local$/i, "");
}

function formatPercent(value: number | null) {
  if (value === null) return "Onbekend";
  return `${Math.round(value)}%`;
}

function barColor(metric: PrtgMetric | null) {
  if (!metric || metric.percent === null) return "bg-veil/15";
  if (metric.status === "down" || metric.status === "downPartial") return "bg-[#c45b4a]";
  if (metric.status === "warning") return "bg-gold";
  if (metric.status === "unusual") return "bg-water";
  return "bg-forest";
}

function hasUsefulMetrics(server: PrtgServer) {
  return Boolean(server.cpu || server.memory || server.storage.length > 0);
}

function MetricCell({ label, metric }: { label: string; metric: PrtgMetric | null }) {
  const width = metric?.percent ?? 0;
  const accent = Boolean(metric && (metric.status === "warning" || metric.status === "down" || metric.status === "downPartial"));
  const missing = !metric || metric.percent === null;
  return (
    <div className={`min-w-0 ${missing ? "opacity-40" : ""}`}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[12px] tracking-[0.08em] text-mist uppercase">{label}</p>
        <p className={`font-display text-[22px] leading-none font-semibold tabular-nums ${accent ? "text-gold" : "text-paper"}`}>
          {formatPercent(metric?.percent ?? null)}
        </p>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-veil/10">
        {!missing ? (
          <motion.div
            className={`h-full rounded-full ${barColor(metric)}`}
            initial={{ width: 0 }}
            animate={{ width: `${Math.max(0, Math.min(100, width))}%` }}
            transition={{ duration: 0.65, ease: "easeOut" }}
          />
        ) : (
          <div className="h-full w-full rounded-full bg-veil/10" />
        )}
      </div>
    </div>
  );
}

export function PrtgServersPanel({
  servers,
  alarms = [],
  fetchedAt = null,
  stale = false,
  status,
  message,
  refreshing = false,
  initialView = "overview",
  initialPage = 0,
}: PrtgServersPanelProps) {
  const [view, setView] = useState<"overview" | "resources">(initialView);
  const [page, setPage] = useState(initialPage);
  const [selected, setSelected] = useState<{ server: PrtgServer; returnFocus: HTMLElement | null } | null>(null);
  if (status === "loading") {
    return <CardState status="loading" title="Servers" message="Servertegels worden opgehaald." />;
  }
  if (status === "error") {
    return <CardState status="error" title="Servers" message={message || "PRTG niet gekoppeld"} />;
  }

  const ordered = sortServersByPriority(servers.filter(hasUsefulMetrics), alarms);
  const overview = ordered.slice(0, 12);
  const pages = paginateServers(ordered, RESOURCE_PAGE_SIZE);
  const pageCount = pages.length;
  const safePage = clampPage(page, pageCount);
  const resourcePage = pages[safePage] ?? [];

  if (status === "empty" || ordered.length === 0) {
    return (
      <div className="tv-card flex h-full min-h-0 flex-col overflow-hidden px-6 py-5" data-refreshing={refreshing}>
        <div className="flex items-end justify-between gap-4">
          <h2 className="font-display text-[34px] leading-none font-semibold tracking-[-0.015em]">Servers</h2>
        </div>
        <div className="mt-6 flex min-h-0 flex-1 items-center justify-center rounded-[22px] border border-veil/10 bg-veil/[0.03]">
          <p className="text-[20px] text-mist">{message || "Geen servers met CPU-, geheugen- of opslagwaarden."}</p>
        </div>
      </div>
    );
  }

  const updated = fetchedAt ? formatAmsterdamTime(fetchedAt) : "–";
  return (
    <div
      className="tv-card flex h-full min-h-0 flex-col overflow-hidden px-6 py-5"
      data-refreshing={refreshing}
      data-server-view={view}
      data-server-stale={stale ? "true" : "false"}
    >
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[15px] tracking-[0.08em] text-mist uppercase">PRTG</p>
          <h2 className="font-display text-[34px] leading-none font-semibold tracking-[-0.015em]">Servers</h2>
        </div>
        <div className="flex items-center gap-3">
          <p className={`text-[14px] ${stale ? "text-gold" : "text-mist"}`} data-server-updated="">
            {stale ? "Verouderd · " : ""}Laatste update {updated}
          </p>
          {view === "resources" && pageCount > 1 ? (
            <div className="flex items-center gap-2" data-server-pager="">
              <button
                type="button"
                className="ship-nav-button"
                data-testid="server-page-prev"
                aria-label="Vorige serverpagina"
                onClick={() => setPage((current) => stepServerPage(clampPage(current, pageCount), pageCount, -1))}
              >
                <ChevronLeft className="h-5 w-5" strokeWidth={2.2} />
              </button>
              <p className="min-w-12 text-center text-[16px] tabular-nums text-paper" data-server-page={safePage + 1} data-server-page-count={pageCount} aria-live="polite">
                {safePage + 1} / {pageCount}
              </p>
              <button
                type="button"
                className="ship-nav-button"
                data-testid="server-page-next"
                aria-label="Volgende serverpagina"
                onClick={() => setPage((current) => stepServerPage(clampPage(current, pageCount), pageCount, 1))}
              >
                <ChevronRight className="h-5 w-5" strokeWidth={2.2} />
              </button>
            </div>
          ) : null}
          <div className="flex rounded-full border border-veil/20 p-1" role="tablist" aria-label="Serverweergave">
            <button
              type="button"
              role="tab"
              aria-selected={view === "overview"}
              data-server-view-tab="overview"
              className={`min-h-11 rounded-full px-4 text-[16px] ${view === "overview" ? "bg-gold text-ink" : "text-paper"}`}
              onClick={() => setView("overview")}
            >
              Overzicht
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === "resources"}
              data-server-view-tab="resources"
              className={`min-h-11 rounded-full px-4 text-[16px] ${view === "resources" ? "bg-gold text-ink" : "text-paper"}`}
              onClick={() => setView("resources")}
            >
              Resources
            </button>
          </div>
        </div>
      </div>
      {view === "resources" ? (
        <div className="mt-4 flex min-h-0 flex-1 flex-col">
          <ServerResourceBoard
            servers={resourcePage}
            alarms={alarms}
            fetchedAt={fetchedAt}
            stale={stale}
            onOpen={(server, returnFocus) => setSelected({ server, returnFocus })}
          />
        </div>
      ) : (
      <div className="mt-4 grid min-h-0 flex-1 grid-cols-4 grid-rows-3 gap-3 overflow-hidden">
        {overview.map((server, index) => {
          const counts = alarmCounts(openAlarms(alarms, server.name));
          return (
          <motion.button
            key={server.id}
            type="button"
            data-testid="server-tile"
            data-server-id={server.id}
            aria-label={`Open details van server ${shortName(server.name) || server.name}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: Math.min(index, 8) * 0.03, ease: "easeOut" }}
            className="flex min-h-0 cursor-pointer flex-col rounded-[20px] border border-veil/12 bg-veil/[0.04] px-4 py-3 text-left hover:border-gold/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
            onClick={(event) => setSelected({ server, returnFocus: event.currentTarget })}
          >
            <div className="flex items-baseline justify-between gap-2">
              <h3
                className="shrink truncate font-display text-[22px] leading-none font-semibold tracking-[-0.015em] text-paper"
                title={server.name}
              >
                {shortName(server.name) || server.name || "Onbekende server"}
              </h3>
              <p className="shrink-0 text-[12px] text-mist" data-server-incidents="" aria-label={`${counts.errors} storingen, ${counts.warnings} waarschuwingen`}>
                {counts.errors > 0 ? <span className="text-[#c45b4a]">{counts.errors}</span> : <span>0</span>}
                <span> / </span>
                <span className={counts.warnings > 0 ? "text-gold" : ""}>{counts.warnings}</span>
              </p>
            </div>
            <div className="mt-3 grid min-h-0 flex-1 content-end gap-2">
              <MetricCell label="CPU" metric={server.cpu} />
              <MetricCell label="RAM" metric={server.memory} />
              <MetricCell label="Disk" metric={primaryVolume(server.storage)} />
            </div>
          </motion.button>
          );
        })}
      </div>
      )}
      {selected ? (
        <ServerResourceDialog
          key={selected.server.id}
          serverId={selected.server.id}
          serverName={shortName(selected.server.name) || selected.server.name}
          returnFocus={selected.returnFocus}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </div>
  );
}
