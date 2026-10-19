import { useCallback, useEffect, useState } from "react";
import { fetchScreens, type ScreenRecord } from "../services/screenApi";

type OpsHealth = {
  status: string;
  version: string;
  services: Record<string, string>;
  pendingMigrations?: number;
};

type BackupHealth = {
  lastSuccessAt: string | null;
  ageSeconds: number | null;
  size: number | null;
  status: string;
  retentionDays: number;
  maxAgeHours: number;
};

type Source = { id: string; name: string; status: string; detail: string };
type VersionInfo = { version: string; commit: string; buildDate: string; environment: string };
type Diagnostics = {
  runtime?: { node?: string; environment?: string };
  ready?: { pendingMigrations?: number; services?: Record<string, string> };
  events?: Array<{ timestamp: string; level: string; message: string; event?: string }>;
};

const TOKEN_KEY = "teunesen-admin-token";

function authHeaders(): Record<string, string> {
  const current = sessionStorage.getItem(TOKEN_KEY);
  return current ? { authorization: `Bearer ${current}` } : {};
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { headers: authHeaders(), cache: "no-store" });
  if (response.status === 503) {
    const payload = (await response.json().catch(() => ({}))) as T;
    return payload;
  }
  if (!response.ok) throw new Error(`Status ${response.status}`);
  return (await response.json()) as T;
}

function badge(status: string) {
  if (status === "healthy" || status === "Online") return "text-paper";
  if (status === "disabled") return "text-mist";
  return "text-gold";
}

export function AdminOperationsSection({ authenticated }: { authenticated: boolean }) {
  const [health, setHealth] = useState<OpsHealth | null>(null);
  const [ready, setReady] = useState<OpsHealth | null>(null);
  const [backups, setBackups] = useState<BackupHealth | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [version, setVersion] = useState<VersionInfo | null>(null);
  const [screens, setScreens] = useState<ScreenRecord[]>([]);
  const [filter, setFilter] = useState<"alle" | ScreenRecord["status"]>("alle");
  const [error, setError] = useState("");
  const [events, setEvents] = useState<Array<{ timestamp: string; level: string; message: string; event?: string }>>([]);
  const [runtime, setRuntime] = useState<{ node?: string; environment?: string } | null>(null);
  const [pendingMigrations, setPendingMigrations] = useState<number | null>(null);

  const reload = useCallback(async () => {
    const [nextHealth, nextReady, nextBackups, nextSources, nextVersion, nextScreens, diagnostics] = await Promise.all([
      getJson<OpsHealth>("/api/health"),
      getJson<OpsHealth>("/api/health/ready"),
      getJson<BackupHealth>("/api/health/backups"),
      getJson<{ sources: Source[] }>("/api/health/sources").catch(() => ({ sources: [] })),
      getJson<VersionInfo>("/api/version"),
      fetchScreens().catch(() => [] as ScreenRecord[]),
      getJson<Diagnostics>("/api/diagnostics").catch((): Diagnostics => ({ events: [] })),
    ]);
    setHealth(nextHealth);
    setReady(nextReady);
    setBackups(nextBackups);
    setSources(nextSources.sources || []);
    setVersion(nextVersion);
    setScreens(nextScreens);
    setEvents(diagnostics.events || []);
    setRuntime(diagnostics.runtime || null);
    setPendingMigrations(diagnostics.ready?.pendingMigrations ?? nextReady.pendingMigrations ?? null);
    if (nextReady.status !== "healthy") setError("Service tijdelijk niet beschikbaar.");
  }, []);

  useEffect(() => {
    if (!authenticated) return;
    let active = true;
    void reload()
      .then(() => {
        if (active) setError("");
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setError(caught instanceof Error ? caught.message : "Overzicht niet geladen.");
      });
    return () => {
      active = false;
    };
  }, [authenticated, reload]);

  if (!authenticated) return null;

  const visible = screens.filter((screen) => (filter === "alle" ? true : screen.status === filter));
  const offlineActive = screens.filter((screen) => screen.enabled && screen.status === "Offline");
  const dbBad = health?.services.database === "unhealthy" || ready?.status === "unhealthy";
  const backupOld = backups && backups.status !== "healthy";
  const sourceFail = sources.filter((item) => item.status === "unhealthy");

  return (
    <section className="tv-card mt-6 px-5 py-4">
      <h2 className="font-display text-[26px] leading-none font-semibold tracking-[-0.015em]">Bedrijfsoverzicht</h2>
      <p className="mt-2 text-[15px] text-mist">
        Server {version?.version || health?.version || "—"} · commit {(version?.commit || "unknown").slice(0, 12)} ·{" "}
        {version?.environment}
        {runtime?.node ? ` · Node ${runtime.node}` : ""}
        {pendingMigrations !== null ? ` · migraties pending ${pendingMigrations}` : ""}
      </p>

      {dbBad ? <p className="mt-3 text-[16px] text-gold">Database is niet beschikbaar of niet ready.</p> : null}
      {backupOld ? <p className="mt-3 text-[16px] text-gold">Backup is te oud of ontbreekt.</p> : null}
      {offlineActive.length ? (
        <p className="mt-3 text-[16px] text-gold">{offlineActive.length} actief scherm is offline.</p>
      ) : null}
      {sourceFail.length ? (
        <p className="mt-3 text-[16px] text-gold">{sourceFail.length} databron faalt herhaaldelijk of nu.</p>
      ) : null}

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <p>
          Server: <span className={badge(health?.status || "")}>{health?.status || "onbekend"}</span>
        </p>
        <p>
          Ready: <span className={badge(ready?.status || "")}>{ready?.status || "onbekend"}</span>
        </p>
        <p>
          Database: <span className={badge(health?.services.database || "")}>{health?.services.database || "onbekend"}</span>
        </p>
        <p>
          Backup: <span className={badge(backups?.status || "")}>{backups?.status || "onbekend"}</span>
          {backups?.lastSuccessAt ? ` · ${new Date(backups.lastSuccessAt).toLocaleString("nl-NL")}` : " · geen dump"}
        </p>
      </div>

      <h3 className="mt-6 font-display text-[22px] font-semibold">Databronnen</h3>
      <ul className="mt-2 space-y-1 text-[15px]">
        {sources.map((source) => (
          <li key={source.id}>
            <span className={badge(source.status)}>{source.status}</span> · {source.name} · {source.detail}
          </li>
        ))}
      </ul>

      <h3 className="mt-6 font-display text-[22px] font-semibold">Schermen</h3>
      <p className="mt-2 text-[15px] text-mist">
        Totaal {screens.length} · online {screens.filter((item) => item.status === "Online").length} · offline{" "}
        {screens.filter((item) => item.status === "Offline").length} · uitgeschakeld{" "}
        {screens.filter((item) => item.status === "Uitgeschakeld").length} · nooit verbonden{" "}
        {screens.filter((item) => item.status === "Nooit verbonden").length}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {(["alle", "Online", "Offline", "Uitgeschakeld", "Nooit verbonden"] as const).map((item) => (
          <button
            key={item}
            type="button"
            className="rounded-full border border-veil/20 px-3 py-1 text-[12px] uppercase"
            onClick={() => setFilter(item)}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-[15px]">
          <thead>
            <tr className="border-b border-veil/12 text-mist">
              <th className="py-2 pr-3 font-medium">Naam</th>
              <th className="py-2 pr-3 font-medium">Status</th>
              <th className="py-2 pr-3 font-medium">Laatst gezien</th>
              <th className="py-2 pr-3 font-medium">Dashboard</th>
              <th className="py-2 font-medium">Playerversie</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((screen) => (
              <tr key={screen.id} className="border-b border-veil/8">
                <td className="py-3 pr-3">{screen.name}</td>
                <td className={`py-3 pr-3 ${badge(screen.status)}`}>{screen.status}</td>
                <td className="py-3 pr-3">{screen.lastSeenAt ? new Date(screen.lastSeenAt).toLocaleString("nl-NL") : "—"}</td>
                <td className="py-3 pr-3">{screen.dashboardName || "Niet gekoppeld"}</td>
                <td className="py-3">{screen.appVersion || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="mt-8 font-display text-[22px] font-semibold">Diagnose</h3>
      <p className="mt-2 text-[14px] text-mist">
        Node-runtime en recente veilige fouten. Geen ruwe logs, geen secrets.
      </p>
      <ul className="mt-3 space-y-1 text-[14px] text-mist">
        {events.length === 0 ? <li>Geen recente waarschuwingen.</li> : null}
        {events.slice(0, 12).map((entry, index) => (
          <li key={`${entry.timestamp}-${index}`}>
            {entry.level} · {entry.event || "log"} · {entry.message}
          </li>
        ))}
      </ul>
      {error ? <p className="mt-4 text-[16px] text-gold">{error}</p> : null}
    </section>
  );
}
