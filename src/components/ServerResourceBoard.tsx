import type { PrtgAlarm, PrtgMetric, PrtgServer } from "../types";
import { formatAmsterdamTime } from "../lib/format";
import {
  alarmCounts,
  compactVolumeName,
  getServerPriority,
  metricTone,
  openAlarms,
  percentLabel,
  primaryVolume,
  priorityReason,
  type GaugeTone,
  type ServerPriorityRank,
} from "../lib/serverBoard";

type ServerResourceBoardProps = {
  servers: PrtgServer[];
  alarms: PrtgAlarm[];
  fetchedAt: string | null;
  stale: boolean;
  onOpen: (server: PrtgServer, returnFocus: HTMLElement | null) => void;
};

const toneStroke: Record<GaugeTone, string> = {
  normal: "stroke-water",
  attention: "stroke-gold",
  critical: "stroke-[#c45b4a]",
  unusual: "stroke-water",
  unknown: "stroke-mist",
};

function shortName(value: string) {
  return value.replace(/\.teunesen\.local$/i, "").replace(/\.local$/i, "");
}

function statusWord(rank: ServerPriorityRank) {
  if (rank === 0) return "Storing";
  if (rank === 1 || rank === 2) return "Aandacht";
  if (rank === 3) return "Afwijkend";
  return "In orde";
}

function statusClass(rank: ServerPriorityRank) {
  if (rank === 0) return "text-[#c45b4a]";
  if (rank === 1 || rank === 2) return "text-gold";
  if (rank === 3) return "text-water";
  return "text-mist";
}

function frameClass(rank: ServerPriorityRank) {
  if (rank === 0) return "border-[#c45b4a]/55";
  if (rank === 1 || rank === 2) return "border-gold/50";
  if (rank === 3) return "border-water/40";
  return "border-veil/12";
}

function gaugeHint(metric: PrtgMetric | null) {
  if (!metric) return null;
  if (metric.status === "down" || metric.status === "downPartial") return "Storing";
  if (metric.status === "warning") return "Waarschuwing";
  if (metric.status === "unusual") return "Afwijkend";
  return null;
}

function Gauge({ label, metric, detail }: { label: string; metric: PrtgMetric | null; detail?: string }) {
  const tone = metricTone(metric);
  const known = metric?.percent !== null && metric?.percent !== undefined;
  const percent = known ? Math.max(0, Math.min(100, metric.percent ?? 0)) : 0;
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const dash = (percent / 100) * circumference;
  const text = percentLabel(metric?.percent ?? null);
  const hint = gaugeHint(metric);
  const title = detail ? `${label} · ${detail}` : label;
  return (
    <div className="flex min-w-0 flex-col items-center" data-gauge={label} data-gauge-tone={tone}>
      <svg viewBox="0 0 100 100" className="server-resource-gauge" role="img" aria-label={`${label}: ${text}`}>
        <circle cx="50" cy="50" r={radius} fill="none" className="stroke-veil/15" strokeWidth="9" />
        {known ? (
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            className={toneStroke[tone]}
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference - dash}`}
            transform="rotate(-90 50 50)"
          />
        ) : null}
        <text x="50" y={known ? "56" : "55"} textAnchor="middle" className="fill-paper" fontSize={known ? "22" : "14"}>
          {known ? `${Math.round(percent)}%` : "–"}
        </text>
      </svg>
      <p className="server-resource-label">{title}</p>
      {hint ? (
        <p
          className={`server-resource-hint ${tone === "critical" ? "text-[#c45b4a]" : tone === "unusual" ? "text-water" : "text-gold"}`}
          data-gauge-hint=""
        >
          {hint}
        </p>
      ) : null}
      {!known ? <p className="sr-only">{text}</p> : null}
    </div>
  );
}

export function ServerResourceBoard({ servers, alarms, fetchedAt, stale, onOpen }: ServerResourceBoardProps) {
  const clock = fetchedAt ? formatAmsterdamTime(fetchedAt) : "–";
  return (
    <div className="server-resources-scroll min-h-0 flex-1" data-server-resources="">
      {servers.map((server) => {
        const incidents = openAlarms(alarms, server.name);
        const counted = alarmCounts(incidents);
        const disk = primaryVolume(server.storage);
        const rank = getServerPriority(server, alarms);
        const resourceWarnings = [server.cpu, server.memory, ...server.storage].filter((item) => item?.status === "warning").length;
        const resourceErrors = [server.cpu, server.memory, ...server.storage].filter(
          (item) => item?.status === "down" || item?.status === "downPartial",
        ).length;
        const counts = {
          warnings: Math.max(counted.warnings, resourceWarnings),
          errors: Math.max(counted.errors, resourceErrors),
        };
        const name = shortName(server.name) || server.name;
        const lead = incidents[0];
        const leadText = lead
          ? lead.message || lead.lastvalue || lead.sensor
          : disk?.status === "warning"
            ? `Opslag ${compactVolumeName(disk.name)} waarschuwing`
            : server.memory?.status === "warning"
              ? "Geheugen waarschuwing"
              : server.cpu?.status === "warning"
                ? "CPU waarschuwing"
                : "";
        return (
          <button
            key={server.id}
            type="button"
            data-testid="server-resource-card"
            data-server-id={server.id}
            data-server-priority={rank}
            data-server-reason={priorityReason(server, alarms)}
            className={`server-resource-card flex min-w-0 cursor-pointer flex-col rounded-[16px] border bg-veil/[0.04] text-left hover:border-gold/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold ${frameClass(rank)}`}
            onClick={(event) => onOpen(server, event.currentTarget)}
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="truncate font-display leading-none font-semibold" title={server.name}>
                {name}
              </h3>
              <span className={`shrink-0 text-[11px] tracking-[0.06em] uppercase ${statusClass(rank)}`} data-server-status="">
                {statusWord(rank)}
              </span>
            </div>
            <p className={`server-resource-time ${stale ? "text-gold" : "text-mist"}`} data-server-updated="">
              {stale ? "Verouderd " : ""}
              {clock}
            </p>
            <div className="server-resource-meters">
              <Gauge label="CPU" metric={server.cpu} />
              <Gauge label="Geheugen" metric={server.memory} />
              <Gauge label="Opslag" metric={disk} detail={disk ? compactVolumeName(disk.name) : undefined} />
            </div>
            <div className="mt-1 flex items-center justify-between gap-2 text-[13px] leading-none">
              <p className="min-w-0 truncate" data-server-incidents="">
                <span className="text-[#c45b4a]">
                  {counts.errors} storing{counts.errors === 1 ? "" : "en"}
                </span>
                <span className="text-mist"> · </span>
                <span className="text-gold">
                  {counts.warnings} waarschuwing{counts.warnings === 1 ? "" : "en"}
                </span>
              </p>
              <span className="shrink-0 text-mist" data-server-details="">
                Details
              </span>
            </div>
            {leadText ? (
              <p className="mt-1 truncate text-[12px] leading-none text-paper" data-server-alarm="" title={leadText}>
                {leadText}
              </p>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
