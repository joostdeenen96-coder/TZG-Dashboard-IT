import { useEffect } from "react";
import { X } from "lucide-react";
import type { PrtgAlarm, PrtgAlarmStatus } from "../types";

type PrtgAlarmDetailProps = {
  alarm: PrtgAlarm;
  onClose: () => void;
};

const statusLabel: Record<PrtgAlarmStatus, string> = {
  warning: "Waarschuwing",
  down: "Down",
  unusual: "Unusual",
  downPartial: "Down (partial)",
  downAcknowledged: "Bevestigd",
};

function shortName(value: string) {
  return value.replace(/\.teunesen\.local$/i, "").replace(/\.local$/i, "");
}

function badgeTone(status: PrtgAlarmStatus, acknowledged: boolean) {
  if (acknowledged || status === "downAcknowledged") return "bg-veil/10 text-mist";
  if (status === "down" || status === "downPartial") return "bg-[#c45b4a]/20 text-[#f0b4aa]";
  if (status === "warning") return "bg-gold/20 text-gold";
  return "bg-water/20 text-water";
}

function formatSince(alarm: PrtgAlarm) {
  if (alarm.sinceLabel) return alarm.sinceLabel;
  if (!alarm.sinceAt) return "Onbekend";
  const stamp = Date.parse(alarm.sinceAt);
  if (!Number.isFinite(stamp)) return "Onbekend";
  return new Intl.DateTimeFormat("nl-NL", {
    timeZone: "Europe/Amsterdam",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(stamp));
}

export function PrtgAlarmDetail({ alarm, onClose }: PrtgAlarmDetailProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-40 grid place-items-center bg-ink/60 p-8 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label="Storingsdetails"
      onClick={onClose}
    >
      <section
        className="tv-card relative w-[920px] max-w-full overflow-hidden px-8 py-7"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="absolute top-5 right-5 grid h-11 w-11 place-items-center rounded-full border border-veil/15 bg-veil/[0.06] text-mist transition-colors hover:bg-veil/12 hover:text-paper"
          aria-label="Sluiten"
          onClick={onClose}
        >
          <X className="h-5 w-5" strokeWidth={2.2} />
        </button>

        <p className="text-[14px] tracking-[0.08em] text-mist uppercase">PRTG-storing</p>
        <div className="mt-2 flex flex-wrap items-center gap-3 pr-14">
          <h2 className="font-display text-[40px] leading-none font-semibold tracking-[-0.02em] text-paper">
            {shortName(alarm.device)}
          </h2>
          <span
            className={`rounded-full px-3 py-1 text-[13px] font-bold tracking-[0.04em] uppercase ${badgeTone(alarm.status, alarm.acknowledged)}`}
          >
            {statusLabel[alarm.status]}
          </span>
        </div>
        <p className="mt-3 text-[20px] text-mist">{alarm.sensor}</p>

        <div className="mt-6 grid grid-cols-2 gap-4">
          <div className="rounded-[20px] border border-veil/12 bg-veil/[0.04] px-5 py-4">
            <p className="text-[13px] tracking-[0.08em] text-mist uppercase">Speelt al</p>
            <p className="mt-2 font-display text-[28px] leading-none font-semibold text-paper">{formatSince(alarm)}</p>
          </div>
          <div className="rounded-[20px] border border-veil/12 bg-veil/[0.04] px-5 py-4">
            <p className="text-[13px] tracking-[0.08em] text-mist uppercase">Laatste waarde</p>
            <p className="mt-2 truncate font-display text-[28px] leading-none font-semibold text-paper">
              {alarm.lastvalue || "—"}
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-[20px] border border-veil/12 bg-veil/[0.04] px-5 py-4">
          <p className="text-[13px] tracking-[0.08em] text-mist uppercase">Melding</p>
          <p className="mt-2 text-[20px] leading-snug text-paper">{alarm.message || "Geen meldingstekst van PRTG."}</p>
          {alarm.group ? <p className="mt-3 text-[16px] text-mist">Groep: {alarm.group}</p> : null}
        </div>

        {alarm.suggestion ? (
          <div className="mt-4 rounded-[20px] border border-gold/25 bg-gold/10 px-5 py-4">
            <p className="text-[13px] tracking-[0.08em] text-gold uppercase">Suggestie</p>
            <p className="mt-2 text-[19px] leading-snug text-paper">{alarm.suggestion}</p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
