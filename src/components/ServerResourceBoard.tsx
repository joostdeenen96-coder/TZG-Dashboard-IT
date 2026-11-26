import type { PrtgAlarm, PrtgMetric, PrtgServer } from "../types";
import { formatAmsterdamTime } from "../lib/format";
import { alarmCounts, metricTone, openAlarms, percentLabel, primaryVolume, type GaugeTone } from "../lib/serverBoard";

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
  unknown: "stroke-mist",
};

function shortName(value: string) {
  return value.replace(/\.teunesen\.local$/i, "").replace(/\.local$/i, "");
}

function statusWord(tone: GaugeTone, counts: { warnings: number; errors: number }) {
  if (counts.errors > 0 || tone === "critical") return "Storing";
  if (counts.warnings > 0 || tone === "attention") return "Aandacht";
  if (tone === "unknown") return "Onbekend";
  return "In orde";
}

function Gauge({ label, metric, detail }: { label: string; metric: PrtgMetric | null; detail?: string }) {
  const tone = metricTone(metric);
  const known = metric?.percent !== null && metric?.percent !== undefined;
  const percent = known ? Math.max(0, Math.min(100, metric!.percent!)) : 0;
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const dash = (percent / 100) * circumference;
  const text = percentLabel(metric?.percent ?? null);
  return (
    <div className="flex min-w-0 flex-col items-center gap-1" data-gauge={label} data-gauge-tone={tone}>
      <svg viewBox="0 0 100 100" className="h-[88px] w-[88px]" role="img" aria-label={`${label}: ${text}`}>
        <circle cx="50" cy="50" r={radius} fill="none" className="stroke-veil/15" strokeWidth="8" />
        {known ? (
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            className={toneStroke[tone]}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference - dash}`}
            transform="rotate(-90 50 50)"
          />
        ) : null}
        {known ? (
          <text x="50" y="56" textAnchor="middle" className="fill-paper" fontSize="16">
            {Math.round(percent)}%
          </text>
        ) : null}
      </svg>
      <p className="text-[12px] tracking-[0.08em] text-mist uppercase">{label}</p>
      <p className="text-center text-[14px] leading-tight text-paper" data-gauge-value="">
        {known ? null : text}
        {detail ? <span className="mt-0.5 block truncate text-[12px] text-mist">{detail}</span> : null}
      </p>
    </div>
  );
}

export function ServerResourceBoard({ servers, alarms, fetchedAt, stale, onOpen }: ServerResourceBoardProps) {
  const clock = fetchedAt ? formatAmsterdamTime(fetchedAt) : "–";
  return (
    <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-3 overflow-auto pr-1" data-server-resources="">
      {servers.map((server) => {
        const incidents = openAlarms(alarms, server.name);
        const counts = alarmCounts(incidents);
        const disk = primaryVolume(server.storage);
        const tones = [metricTone(server.cpu), metricTone(server.memory), metricTone(disk)];
        const tone = tones.includes("critical")
          ? "critical"
          : tones.includes("attention")
            ? "attention"
            : tones.every((item) => item === "unknown")
              ? "unknown"
              : "normal";
        const name = shortName(server.name) || server.name;
        return (
          <button
            key={server.id}
            type="button"
            data-testid="server-resource-card"
            data-server-id={server.id}
            className="flex min-h-[220px] min-w-0 cursor-pointer flex-col rounded-[20px] border border-veil/12 bg-veil/[0.04] px-4 py-3 text-left hover:border-gold/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
            onClick={(event) => onOpen(server, event.currentTarget)}
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="truncate font-display text-[22px] leading-none font-semibold" title={server.name}>
                {name}
              </h3>
              <span className="shrink-0 rounded-full border border-veil/20 px-2 py-1 text-[12px] tracking-[0.04em] uppercase" data-server-status="">
                {statusWord(tone, counts)}
              </span>
            </div>
            <p className={`mt-2 text-[13px] ${stale ? "text-gold" : "text-mist"}`} data-server-updated="">
              {stale ? "Verouderd · " : ""}Laatste update {clock}
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <Gauge label="CPU" metric={server.cpu} />
              <Gauge label="Geheugen" metric={server.memory} />
              <Gauge label="Opslag" metric={disk} detail={disk ? shortName(disk.name) : undefined} />
            </div>
            <div className="mt-3 flex items-end justify-between gap-3 text-[14px]">
              <p data-server-incidents="">
                <span className="text-[#c45b4a]">{counts.errors} storing{counts.errors === 1 ? "" : "en"}</span>
                <span className="text-mist"> · </span>
                <span className="text-gold">{counts.warnings} waarschuwing{counts.warnings === 1 ? "" : "en"}</span>
              </p>
              <span className="text-mist">Details</span>
            </div>
            {incidents.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {incidents.slice(0, 2).map((alarm) => (
                  <li key={alarm.id} className="truncate text-[13px] text-paper" data-server-alarm="">
                    {alarm.sensor}: {alarm.message || alarm.lastvalue || alarm.status}
                  </li>
                ))}
              </ul>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
