import { motion } from "framer-motion";
import type { PrtgMetric, PrtgSensorStatus, PrtgServer } from "../types";
import { CardState } from "./CardState";

type PrtgServersPanelProps = {
  servers: PrtgServer[];
  status: "loading" | "error" | "empty" | "ready" | "fallback";
  message?: string;
  refreshing?: boolean;
};

const statusLabel: Record<PrtgSensorStatus, string> = {
  up: "Up",
  warning: "Warning",
  down: "Down",
  unusual: "Unusual",
  downPartial: "Partial",
  downAcknowledged: "Bevestigd",
  unknown: "—",
};

function formatPercent(value: number | null) {
  if (value === null) return "—";
  return `${Math.round(value)}%`;
}

function barColor(metric: PrtgMetric | null) {
  if (!metric || metric.percent === null) return "bg-veil/15";
  if (metric.status === "down" || metric.status === "downPartial") return "bg-[#c45b4a]";
  if (metric.status === "warning" || metric.high) return "bg-gold";
  if (metric.status === "unusual") return "bg-water";
  return "bg-forest";
}

function MetricRow({ label, metric }: { label: string; metric: PrtgMetric | null }) {
  const width = metric?.percent ?? 0;
  const accent = metric?.high || metric?.status === "warning" || metric?.status === "down";
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[14px] tracking-[0.06em] text-mist uppercase">{label}</p>
        <p className={`font-display text-[22px] font-semibold tabular-nums ${accent ? "text-gold" : "text-paper"}`}>
          {formatPercent(metric?.percent ?? null)}
        </p>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-veil/10">
        <motion.div
          className={`h-full rounded-full ${barColor(metric)}`}
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(0, Math.min(100, width))}%` }}
          transition={{ duration: 0.7, ease: "easeOut" }}
        />
      </div>
      <p className="mt-1 truncate text-[13px] text-mist">
        {metric ? `${statusLabel[metric.status]}${metric.name ? ` · ${metric.name}` : ""}` : "Geen sensor"}
      </p>
    </div>
  );
}

function primaryStorage(server: PrtgServer) {
  if (server.storage.length === 0) return null;
  return server.storage[0] ?? null;
}

export function PrtgServersPanel({ servers, status, message, refreshing = false }: PrtgServersPanelProps) {
  if (status === "loading") {
    return <CardState status="loading" title="Servers" message="Servertegels worden opgehaald." />;
  }
  if (status === "error") {
    return <CardState status="error" title="Servers" message={message || "PRTG niet gekoppeld"} />;
  }
  if (status === "empty" || servers.length === 0) {
    return (
      <div className="tv-card flex h-full min-h-0 flex-col overflow-hidden px-6 py-5" data-refreshing={refreshing}>
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-[15px] tracking-[0.08em] text-mist uppercase">PRTG</p>
            <h2 className="font-display text-[34px] leading-none font-semibold tracking-[-0.015em]">Servers</h2>
          </div>
        </div>
        <div className="mt-6 flex min-h-0 flex-1 items-center justify-center rounded-[22px] border border-veil/10 bg-veil/[0.03]">
          <p className="text-[20px] text-mist">{message || "Geen servertegels voor deze filter."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="tv-card flex h-full min-h-0 flex-col overflow-hidden px-6 py-5" data-refreshing={refreshing}>
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[15px] tracking-[0.08em] text-mist uppercase">PRTG</p>
          <h2 className="font-display text-[34px] leading-none font-semibold tracking-[-0.015em]">Servers</h2>
        </div>
        <p className="text-[16px] text-mist">{servers.length} apparaten</p>
      </div>
      <div className="mt-4 grid min-h-0 flex-1 grid-cols-3 gap-3 overflow-hidden content-start">
        {servers.slice(0, 9).map((server, index) => (
          <motion.article
            key={server.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: Math.min(index, 6) * 0.045, ease: "easeOut" }}
            className="flex min-h-0 flex-col gap-3 rounded-[22px] border border-veil/12 bg-veil/[0.04] px-4 py-3"
          >
            <h3 className="truncate font-display text-[24px] font-semibold tracking-[-0.015em]">{server.name}</h3>
            <MetricRow label="CPU" metric={server.cpu} />
            <MetricRow label="Geheugen" metric={server.memory} />
            <MetricRow label="Opslag" metric={primaryStorage(server)} />
          </motion.article>
        ))}
      </div>
    </div>
  );
}
