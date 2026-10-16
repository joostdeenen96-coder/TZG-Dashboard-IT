import { motion } from "framer-motion";
import type { PrtgAlarm, PrtgAlarmStatus } from "../types";
import { CardState } from "./CardState";

type PrtgAlarmsPanelProps = {
  alarms: PrtgAlarm[];
  status: "loading" | "error" | "empty" | "ready" | "fallback";
  message?: string;
  refreshing?: boolean;
};

const statusLabel: Record<PrtgAlarmStatus, string> = {
  warning: "Warning",
  down: "Down",
  unusual: "Unusual",
  downPartial: "Partial",
  downAcknowledged: "Bevestigd",
};

function shortName(value: string) {
  return value.replace(/\.teunesen\.local$/i, "").replace(/\.local$/i, "");
}

function statusTone(status: PrtgAlarmStatus, acknowledged: boolean) {
  if (acknowledged || status === "downAcknowledged") return "border-veil/10 bg-veil/[0.03]";
  if (status === "down" || status === "downPartial") return "border-[#c45b4a]/35 bg-[#c45b4a]/10";
  if (status === "warning") return "border-gold/35 bg-gold/10";
  return "border-water/30 bg-water/10";
}

function badgeTone(status: PrtgAlarmStatus, acknowledged: boolean) {
  if (acknowledged || status === "downAcknowledged") return "bg-veil/10 text-mist";
  if (status === "down" || status === "downPartial") return "bg-[#c45b4a]/20 text-[#f0b4aa]";
  if (status === "warning") return "bg-gold/20 text-gold";
  return "bg-water/20 text-water";
}

export function PrtgAlarmsPanel({ alarms, status, message, refreshing = false }: PrtgAlarmsPanelProps) {
  if (status === "loading") {
    return <CardState status="loading" title="Storingen" message="PRTG-gegevens worden opgehaald." />;
  }
  if (status === "error") {
    return <CardState status="error" title="Storingen" message={message || "PRTG niet gekoppeld"} />;
  }
  if (status === "empty" || alarms.length === 0) {
    return (
      <div className="tv-card flex h-full min-h-0 flex-col overflow-hidden px-5 py-4" data-refreshing={refreshing}>
        <div className="flex items-end justify-between gap-3">
          <h2 className="font-display text-[28px] leading-none font-semibold tracking-[-0.015em]">Storingen</h2>
          <p className="text-[15px] text-forest">Geen</p>
        </div>
        <div className="mt-4 flex min-h-0 flex-1 items-center justify-center rounded-[18px] border border-veil/10 bg-veil/[0.03] px-4">
          <p className="text-center text-[17px] text-mist">{message || "Geen open waarschuwingen."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="tv-card flex h-full min-h-0 flex-col overflow-hidden px-5 py-4" data-refreshing={refreshing}>
      <div className="flex items-end justify-between gap-3">
        <h2 className="font-display text-[28px] leading-none font-semibold tracking-[-0.015em]">Storingen</h2>
        <p className="text-[15px] text-mist">{alarms.length} actief</p>
      </div>
      <ul className="mt-3 flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
        {alarms.slice(0, 7).map((alarm, index) => (
          <motion.li
            key={alarm.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: alarm.acknowledged ? 0.7 : 1, y: 0 }}
            transition={{ duration: 0.3, delay: Math.min(index, 4) * 0.035, ease: "easeOut" }}
            className={`rounded-[16px] border px-3.5 py-2.5 ${statusTone(alarm.status, alarm.acknowledged)}`}
          >
            <div className="flex items-center gap-2">
              <p className="min-w-0 flex-1 truncate font-display text-[20px] font-semibold tracking-[-0.01em]">
                {shortName(alarm.device)}
              </p>
              <span
                className={`shrink-0 rounded-full px-2.5 py-0.5 text-[12px] font-bold tracking-[0.04em] uppercase ${badgeTone(alarm.status, alarm.acknowledged)}`}
              >
                {statusLabel[alarm.status]}
              </span>
            </div>
            <p className="mt-1 truncate text-[15px] text-mist">
              {alarm.sensor}
              {alarm.message ? ` · ${alarm.message}` : ""}
            </p>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}
