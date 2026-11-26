import { useEffect, useState, type ReactNode } from "react";
import { formatAmsterdamTime } from "../lib/format";
import { SERVER_RESOURCE_REFRESH_MS, startServerResourcePoll } from "../services/serverResourcePoll";
import { loadServerResources } from "../services/serverResourceService";
import type { ServerDisk, ServerResourceResponse, ServerResourceStatus } from "../types/serverResources";
import { DashboardDetailModal } from "./DashboardDetailModal";

type ServerResourceDialogProps = {
  serverId: string;
  serverName: string;
  onClose: () => void;
  returnFocus?: HTMLElement | null;
};

function dash(value: string | null | undefined) {
  return value && value.trim() ? value : "–";
}

function percentText(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "–";
  return `${Math.round(value * 10) / 10}%`;
}

function formatBytes(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "–";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let amount = value;
  let index = 0;
  while (amount >= 1024 && index < units.length - 1) {
    amount /= 1024;
    index += 1;
  }
  const shown = amount >= 10 || index === 0 ? Math.round(amount) : Math.round(amount * 10) / 10;
  return `${shown} ${units[index]}`;
}

function clock(iso: string | null) {
  if (!iso) return "–";
  try {
    return formatAmsterdamTime(iso);
  } catch {
    return "–";
  }
}

function statusLabel(status: ServerResourceStatus | null | undefined) {
  if (status === "up") return "In orde";
  if (status === "warning") return "Waarschuwing";
  if (status === "down" || status === "downPartial") return "Storing";
  if (status === "downAcknowledged") return "Bevestigd";
  if (status === "unusual") return "Afwijkend";
  if (status === "paused") return "Gepauzeerd";
  if (!status) return "–";
  return "Onbekend";
}

function statusClass(status: ServerResourceStatus | null | undefined) {
  if (status === "up") return "text-forest";
  if (status === "warning" || status === "unusual") return "text-gold";
  if (status === "down" || status === "downPartial") return "text-[#c45b4a]";
  return "text-mist";
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] border border-veil/12 bg-veil/[0.04] px-4 py-3">
      <p className="text-[12px] tracking-[0.08em] text-mist uppercase">{label}</p>
      <p className="mt-1 font-display text-[28px] leading-none font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function DiskRow({ disk }: { disk: ServerDisk }) {
  const width = disk.usedPercentage === null ? 0 : Math.max(0, Math.min(100, disk.usedPercentage));
  return (
    <li className="min-w-0">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 text-[16px] break-words">{disk.name}</p>
        <p className={`shrink-0 text-[14px] ${statusClass(disk.status)}`}>{statusLabel(disk.status)}</p>
      </div>
      <p className="mt-1 text-[14px] text-mist tabular-nums">
        {percentText(disk.usedPercentage)} · vrij {formatBytes(disk.freeBytes)} / totaal {formatBytes(disk.totalBytes)}
      </p>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-veil/10">
        <div className="h-full rounded-full bg-gold" style={{ width: `${width}%` }} />
      </div>
    </li>
  );
}

export function ServerResourceDialog({ serverId, serverName, onClose, returnFocus }: ServerResourceDialogProps) {
  const [payload, setPayload] = useState<ServerResourceResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    let current: AbortController | null = null;
    const load = () => {
      current?.abort();
      const controller = new AbortController();
      current = controller;
      void loadServerResources(serverId, controller.signal)
        .then((next) => {
          if (!alive) return;
          setPayload(next);
          setFailed(false);
        })
        .catch((error: unknown) => {
          if (!alive || (error instanceof DOMException && error.name === "AbortError")) return;
          if (alive) setFailed(true);
        });
    };
    const stop = startServerResourcePoll(load, SERVER_RESOURCE_REFRESH_MS);
    return () => {
      alive = false;
      current?.abort();
      stop();
    };
  }, [serverId]);

  const server = payload?.server ?? null;
  const stale = Boolean(server) && (failed || payload?.cacheStatus === "stale");
  const unavailable = !server && (failed || payload?.cacheStatus === "unavailable");
  const primaryDisk = server?.disks[0] ?? null;

  return (
    <DashboardDetailModal
      title={server?.serverName || serverName}
      kicker="Server"
      testId="server-resource-dialog"
      onClose={onClose}
      returnFocus={returnFocus}
      subtitle={
        <span className={statusClass(server?.status)}>
          {server ? statusLabel(server.status) : "Gegevens worden opgehaald"}
        </span>
      }
      footer={
        <p>
          {stale ? "Gegevens tijdelijk niet vernieuwd · " : ""}
          Laatst bijgewerkt {clock(server?.retrievedAt ?? payload?.retrievedAt ?? null)}
        </p>
      }
    >
      {!server && !unavailable ? <p className="text-[18px] text-mist">Servergegevens worden opgehaald.</p> : null}
      {unavailable ? <p className="text-[18px] text-mist">{payload?.error || "Servergegevens tijdelijk niet beschikbaar"}</p> : null}
      {server ? (
        <div className="grid gap-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <SummaryCard label="CPU" value={percentText(server.cpu?.usedPercent ?? null)} />
            <SummaryCard label="Geheugen" value={percentText(server.memory?.usedPercent ?? null)} />
            <SummaryCard label={primaryDisk ? primaryDisk.name : "Opslag"} value={percentText(primaryDisk?.usedPercentage ?? null)} />
            <SummaryCard label="Uptime" value={dash(server.availability?.uptime)} />
          </div>
          <dl className="dashboard-detail-fields">
            <div className="dashboard-detail-field">
              <dt>Groep</dt>
              <dd>{dash(server.groupName)}</dd>
            </div>
            <div className="dashboard-detail-field">
              <dt>IP-adres</dt>
              <dd>{dash(server.ipAddress)}</dd>
            </div>
            <div className="dashboard-detail-field">
              <dt>Besturingssysteem</dt>
              <dd>{dash(server.operatingSystem)}</dd>
            </div>
            <div className="dashboard-detail-field">
              <dt>Laatste meting</dt>
              <dd>{clock(server.lastUpdatedAt)}</dd>
            </div>
            <div className="dashboard-detail-field">
              <dt>PRTG-status</dt>
              <dd className={statusClass(server.status)}>{statusLabel(server.status)}</dd>
            </div>
          </dl>
          <Section title="CPU">
            <p className="text-[18px] tabular-nums">
              {percentText(server.cpu?.usedPercent ?? null)}{" "}
              <span className={statusClass(server.cpu?.status)}>{server.cpu ? statusLabel(server.cpu.status) : "–"}</span>
            </p>
            <p className="text-[14px] text-mist">{server.cpu?.sensorName ?? "–"} · {clock(server.cpu?.measuredAt ?? null)}</p>
          </Section>
          <Section title="Geheugen">
            <p className="text-[18px] tabular-nums">{percentText(server.memory?.usedPercent ?? null)} gebruikt</p>
            <p className="text-[14px] text-mist">
              gebruikt {formatBytes(server.memory?.usedBytes ?? null)} · vrij {formatBytes(server.memory?.freeBytes ?? null)} · totaal{" "}
              {formatBytes(server.memory?.totalBytes ?? null)}
            </p>
            <p className={`text-[14px] ${statusClass(server.memory?.status)}`}>
              {server.memory ? statusLabel(server.memory.status) : "–"} · {clock(server.memory?.measuredAt ?? null)}
            </p>
          </Section>
          <Section title="Opslag">
            {server.disks.length === 0 ? <p className="text-mist">–</p> : (
              <ul className="grid gap-3">
                {server.disks.map((disk) => (
                  <DiskRow key={disk.sourceSensorId} disk={disk} />
                ))}
              </ul>
            )}
          </Section>
          <Section title="Netwerk">
            {server.network.length === 0 ? <p className="text-mist">–</p> : (
              <ul className="grid gap-2">
                {server.network.map((item) => (
                  <li key={item.sourceSensorId} className="text-[16px]">
                    <span className="text-paper">{item.name}</span>{" "}
                    <span className="text-mist tabular-nums">
                      in {item.inbound ?? "–"} {item.unit ?? ""} · uit {item.outbound ?? "–"} {item.unit ?? ""}
                      {item.errors !== null ? ` · fouten ${item.errors}` : ""}
                    </span>{" "}
                    <span className={statusClass(item.status)}>{statusLabel(item.status)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <Section title="Beschikbaarheid">
            <p className="text-[16px] text-mist">
              Uptime {dash(server.availability?.uptime)} · ping {dash(server.availability?.ping)} · responstijd{" "}
              {dash(server.availability?.responseTime)}
              {server.availability?.lastReboot ? ` · laatste herstart ${server.availability.lastReboot}` : ""}
            </p>
          </Section>
          <Section title="Waarschuwingen">
            {server.alerts.length === 0 ? <p className="text-mist">–</p> : (
              <ul className="grid gap-2">
                {server.alerts.map((alert) => (
                  <li key={alert.id}>
                    <p className={`text-[16px] ${statusClass(alert.status)}`}>
                      {alert.name} · {statusLabel(alert.status)}
                    </p>
                    <p className="text-[14px] text-mist">{alert.message || alert.lastvalue || "–"} · {clock(alert.measuredAt)} · {alert.device}</p>
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <Section title="Overige sensoren">
            {server.otherSensors.length === 0 ? <p className="text-mist">–</p> : (
              <ul className="grid gap-1">
                {server.otherSensors.map((sensor) => (
                  <li key={sensor.id} className="flex items-baseline justify-between gap-3 text-[15px]">
                    <span className="truncate">{sensor.name}</span>
                    <span className="shrink-0 text-mist tabular-nums">{sensor.lastvalue || "–"}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      ) : null}
    </DashboardDetailModal>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-[13px] tracking-[0.08em] text-mist uppercase">{title}</h3>
      {children}
    </section>
  );
}
