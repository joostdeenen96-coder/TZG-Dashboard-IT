import { motion } from "framer-motion";
import type { PrtgMetric, PrtgServer } from "../types";
import { CardState } from "./CardState";

type PrtgServersPanelProps = {
  servers: PrtgServer[];
  status: "loading" | "error" | "empty" | "ready" | "fallback";
  message?: string;
  refreshing?: boolean;
};

function shortName(value: string) {
  return value.replace(/\.teunesen\.local$/i, "").replace(/\.local$/i, "");
}

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

function metricScore(metric: PrtgMetric | null) {
  if (!metric) return 0;
  let score = 1;
  if (metric.percent !== null) score += metric.percent;
  if (metric.high) score += 40;
  if (metric.status === "warning") score += 60;
  if (metric.status === "unusual") score += 50;
  if (metric.status === "down" || metric.status === "downPartial") score += 100;
  return score;
}

function primaryStorage(server: PrtgServer) {
  if (server.storage.length === 0) return null;
  return [...server.storage].sort((left, right) => metricScore(right) - metricScore(left))[0] ?? null;
}

function hasUsefulMetrics(server: PrtgServer) {
  const storage = primaryStorage(server);
  return Boolean(
    (server.cpu && server.cpu.percent !== null) ||
      (server.memory && server.memory.percent !== null) ||
      (storage && storage.percent !== null),
  );
}

function serverPriority(server: PrtgServer) {
  const storage = primaryStorage(server);
  return metricScore(server.cpu) + metricScore(server.memory) + metricScore(storage);
}

function MetricCell({ label, metric }: { label: string; metric: PrtgMetric | null }) {
  const width = metric?.percent ?? 0;
  const accent = Boolean(metric && (metric.high || metric.status === "warning" || metric.status === "down"));
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

export function PrtgServersPanel({ servers, status, message, refreshing = false }: PrtgServersPanelProps) {
  if (status === "loading") {
    return <CardState status="loading" title="Servers" message="Servertegels worden opgehaald." />;
  }
  if (status === "error") {
    return <CardState status="error" title="Servers" message={message || "PRTG niet gekoppeld"} />;
  }

  const ranked = [...servers]
    .filter(hasUsefulMetrics)
    .sort((left, right) => serverPriority(right) - serverPriority(left) || left.name.localeCompare(right.name, "nl"))
    .slice(0, 12);

  if (status === "empty" || ranked.length === 0) {
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

  return (
    <div className="tv-card flex h-full min-h-0 flex-col overflow-hidden px-6 py-5" data-refreshing={refreshing}>
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[15px] tracking-[0.08em] text-mist uppercase">PRTG</p>
          <h2 className="font-display text-[34px] leading-none font-semibold tracking-[-0.015em]">Servers</h2>
        </div>
        <p className="text-[16px] text-mist">
          {ranked.length} van {servers.length} met meetwaarden
        </p>
      </div>
      <div className="mt-4 grid min-h-0 flex-1 grid-cols-4 grid-rows-3 gap-3 overflow-hidden">
        {ranked.map((server, index) => (
          <motion.article
            key={server.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: Math.min(index, 8) * 0.03, ease: "easeOut" }}
            className="flex min-h-0 flex-col justify-between rounded-[20px] border border-veil/12 bg-veil/[0.04] px-4 py-3"
          >
            <h3 className="truncate font-display text-[22px] leading-tight font-semibold tracking-[-0.015em]">
              {shortName(server.name)}
            </h3>
            <div className="mt-3 grid gap-2.5">
              <MetricCell label="CPU" metric={server.cpu} />
              <MetricCell label="RAM" metric={server.memory} />
              <MetricCell label="Disk" metric={primaryStorage(server)} />
            </div>
          </motion.article>
        ))}
      </div>
    </div>
  );
}
