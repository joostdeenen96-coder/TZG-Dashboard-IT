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
  warning: "Waarschuwing",
  down: "Down",
  unusual: "Unusual",
  downPartial: "Down (partial)",
  downAcknowledged: "Bevestigd",
};

function statusTone(status: PrtgAlarmStatus, acknowledged: boolean) {
  if (acknowledged || status === "downAcknowledged") return "border-veil/10 bg-veil/[0.03] text-mist";
  if (status === "down" || status === "downPartial") return "border-[#c45b4a]/35 bg-[#c45b4a]/10 text-paper";
  if (status === "warning") return "border-gold/35 bg-gold/10 text-paper";
  return "border-water/30 bg-water/10 text-paper";
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
      <div className="tv-card flex h-full min-h-0 flex-col overflow-hidden px-6 py-5" data-refreshing={refreshing}>
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-[15px] tracking-[0.08em] text-mist uppercase">PRTG</p>
            <h2 className="font-display text-[34px] leading-none font-semibold tracking-[-0.015em]">Storingen</h2>
          </div>
          <p className="text-[16px] text-forest">Geen open storingen</p>
        </div>
        <div className="mt-6 flex min-h-0 flex-1 items-center justify-center rounded-[22px] border border-veil/10 bg-veil/[0.03]">
          <p className="text-[20px] text-mist">{message || "Geen waarschuwingen of fouten in de gefilterde groep."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="tv-card flex h-full min-h-0 flex-col overflow-hidden px-6 py-5" data-refreshing={refreshing}>
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[15px] tracking-[0.08em] text-mist uppercase">PRTG</p>
          <h2 className="font-display text-[34px] leading-none font-semibold tracking-[-0.015em]">Storingen</h2>
        </div>
        <p className="text-[16px] text-mist">{alarms.length} actief</p>
      </div>
      <div className="mt-4 min-h-0 flex-1 overflow-hidden">
        <ul className="flex h-full flex-col gap-2.5 overflow-hidden">
          {alarms.slice(0, 8).map((alarm, index) => (
            <motion.li
              key={alarm.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: alarm.acknowledged ? 0.72 : 1, y: 0 }}
              transition={{ duration: 0.35, delay: Math.min(index, 5) * 0.04, ease: "easeOut" }}
              className={`grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_140px_minmax(0,1.4fr)] items-center gap-3 rounded-[18px] border px-4 py-3 ${statusTone(alarm.status, alarm.acknowledged)}`}
            >
              <p className="truncate font-display text-[22px] font-semibold tracking-[-0.01em]">{alarm.device}</p>
              <p className="truncate text-[18px] text-mist">{alarm.sensor}</p>
              <span
                className={`justify-self-start rounded-full px-3 py-1 text-[13px] font-bold tracking-[0.04em] uppercase ${badgeTone(alarm.status, alarm.acknowledged)}`}
              >
                {statusLabel[alarm.status]}
              </span>
              <p className="truncate text-[17px] text-mist">{alarm.message || "—"}</p>
            </motion.li>
          ))}
        </ul>
      </div>
    </div>
  );
}
