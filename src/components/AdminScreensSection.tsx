import { useCallback, useEffect, useState, type FormEvent } from "react";
import { fetchDashboards } from "../services/dashboardApi";
import {
  createScreen,
  deleteScreen,
  fetchAudit,
  fetchScreens,
  issueScreenToken,
  revokeScreenTokens,
  updateScreen,
  type AuditEntry,
  type ScreenRecord,
} from "../services/screenApi";
import type { DashboardDefinition } from "../types/dashboard";

const fieldClass =
  "mt-1 w-full rounded-lg border border-veil/12 bg-ink px-3 py-2 text-[16px] text-paper outline-none focus:border-gold";

function slugifyTyping(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+/, "")
    .slice(0, 64);
}

function slugify(value: string) {
  return slugifyTyping(value).replace(/-+$/g, "");
}

function formatSeen(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("nl-NL", { dateStyle: "short", timeStyle: "medium" });
}

export function AdminScreensSection({ authenticated }: { authenticated: boolean }) {
  const [screens, setScreens] = useState<ScreenRecord[]>([]);
  const [dashboards, setDashboards] = useState<DashboardDefinition[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [editing, setEditing] = useState<ScreenRecord | null>(null);
  const [issuedUrl, setIssuedUrl] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "saved">("idle");
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [location, setLocation] = useState("");
  const [dashboardId, setDashboardId] = useState("");

  const reload = useCallback(async () => {
    const [nextScreens, nextDashboards, nextAudit] = await Promise.all([
      fetchScreens(),
      fetchDashboards(),
      fetchAudit(),
    ]);
    setScreens(nextScreens);
    setDashboards(nextDashboards);
    setAudit(nextAudit);
  }, []);

  useEffect(() => {
    if (!authenticated) return;
    let active = true;
    void reload()
      .then(() => {
        if (active) setStatus("idle");
      })
      .catch((error: unknown) => {
        if (!active) return;
        setStatus("error");
        setMessage(error instanceof Error ? error.message : "Schermen niet geladen.");
      });
    return () => {
      active = false;
    };
  }, [authenticated, reload]);

  if (!authenticated) return null;

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setStatus("loading");
    setMessage("");
    try {
      const created = await createScreen({
        name: name.trim(),
        slug: slugify(slug || name),
        location: location.trim(),
        enabled: true,
        dashboardId: dashboardId || null,
      });
      setName("");
      setSlug("");
      setLocation("");
      setDashboardId("");
      await reload();
      setEditing(created);
      setStatus("saved");
      setMessage("Scherm aangemaakt.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Aanmaken mislukt.");
    }
  }

  async function onSave(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    setStatus("loading");
    setMessage("");
    try {
      const saved = await updateScreen(editing.id, {
        name: editing.name,
        slug: slugify(editing.slug),
        location: editing.location,
        enabled: editing.enabled,
        dashboardId: editing.dashboardId,
      });
      setEditing(saved);
      await reload();
      setStatus("saved");
      setMessage("Scherm opgeslagen.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Opslaan mislukt.");
    }
  }

  async function onIssue(screen: ScreenRecord) {
    if (screen.hasActiveToken && !window.confirm("Het huidige token wordt ingetrokken en vervangen.")) return;
    setStatus("loading");
    setMessage("");
    try {
      const issued = await issueScreenToken(screen.id);
      const url = `${window.location.origin}${issued.playerPath}`;
      setIssuedUrl(url);
      await reload();
      setStatus("saved");
      setMessage("Token één keer zichtbaar. Kopieer de player-URL nu.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Token niet aangemaakt.");
    }
  }

  async function onRevoke(screen: ScreenRecord) {
    if (!window.confirm(`Token van “${screen.name}” intrekken?`)) return;
    setStatus("loading");
    try {
      await revokeScreenTokens(screen.id);
      setIssuedUrl("");
      await reload();
      setStatus("saved");
      setMessage("Token ingetrokken.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Intrekken mislukt.");
    }
  }

  async function onDelete(screen: ScreenRecord) {
    if (!window.confirm(`Scherm “${screen.name}” verwijderen?`)) return;
    setStatus("loading");
    try {
      await deleteScreen(screen.id);
      if (editing?.id === screen.id) setEditing(null);
      await reload();
      setStatus("saved");
      setMessage("Scherm verwijderd.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Verwijderen mislukt.");
    }
  }

  async function copyUrl() {
    if (!issuedUrl) return;
    await navigator.clipboard.writeText(issuedUrl);
    setMessage("Player-URL gekopieerd.");
  }

  return (
    <section className="tv-card mt-6 px-5 py-4">
      <h2 className="font-display text-[26px] leading-none font-semibold tracking-[-0.015em]">Schermen</h2>
      <p className="mt-2 text-[15px] text-mist">
        Koppel een dashboard en genereer een player-URL. Het token wordt alleen bij uitgifte getoond.
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[860px] text-left text-[15px]">
          <thead>
            <tr className="border-b border-veil/12 text-mist">
              <th className="py-2 pr-3 font-medium">Naam</th>
              <th className="py-2 pr-3 font-medium">Slug</th>
              <th className="py-2 pr-3 font-medium">Locatie</th>
              <th className="py-2 pr-3 font-medium">Dashboard</th>
              <th className="py-2 pr-3 font-medium">Status</th>
              <th className="py-2 pr-3 font-medium">Laatst gezien</th>
              <th className="py-2 font-medium">Acties</th>
            </tr>
          </thead>
          <tbody>
            {screens.map((screen) => (
              <tr key={screen.id} className="border-b border-veil/8">
                <td className="py-3 pr-3">{screen.name}</td>
                <td className="py-3 pr-3 font-mono text-[14px] text-mist">{screen.slug}</td>
                <td className="py-3 pr-3">{screen.location || "—"}</td>
                <td className="py-3 pr-3">{screen.dashboardName || "Niet gekoppeld"}</td>
                <td className="py-3 pr-3">{screen.status}</td>
                <td className="py-3 pr-3">{formatSeen(screen.lastSeenAt)}</td>
                <td className="py-3">
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="rounded-full border border-veil/20 px-3 py-1 text-[12px] uppercase" onClick={() => setEditing(structuredClone(screen))}>
                      Bewerken
                    </button>
                    <button type="button" className="rounded-full border border-veil/20 px-3 py-1 text-[12px] uppercase" onClick={() => void onIssue(screen)}>
                      {screen.hasActiveToken ? "Nieuw token" : "Token"}
                    </button>
                    <button type="button" className="rounded-full border border-veil/20 px-3 py-1 text-[12px] uppercase" onClick={() => void onRevoke(screen)} disabled={!screen.hasActiveToken}>
                      Intrekken
                    </button>
                    <button type="button" className="rounded-full border border-gold/40 px-3 py-1 text-[12px] text-gold uppercase" onClick={() => void onDelete(screen)}>
                      Verwijder
                    </button>
                  </div>
                  <p className="mt-1 text-[12px] text-mist">
                    {screen.hasActiveToken ? "Token actief — URL alleen bij uitgifte" : "Geen token"}
                  </p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {issuedUrl ? (
        <div className="mt-4 rounded-lg border border-gold/40 px-4 py-3">
          <p className="text-[15px] text-gold">Dit token en deze URL worden één keer getoond.</p>
          <p className="mt-2 font-mono text-[14px] break-all">{issuedUrl}</p>
          <button type="button" className="mt-3 rounded-full border border-veil/20 px-4 py-2 text-[14px] uppercase" onClick={() => void copyUrl()}>
            Kopieer player-URL
          </button>
        </div>
      ) : null}

      <form className="mt-5 grid gap-3 md:grid-cols-2" onSubmit={(event) => void onCreate(event)}>
        <label className="block text-[14px] tracking-wide text-mist uppercase">
          Nieuw scherm — naam
          <input className={fieldClass} value={name} onChange={(event) => {
            setName(event.target.value);
            if (!slug) setSlug(slugifyTyping(event.target.value));
          }} />
        </label>
        <label className="block text-[14px] tracking-wide text-mist uppercase">
          Slug
          <input className={fieldClass} value={slug} onChange={(event) => setSlug(slugifyTyping(event.target.value))} onBlur={() => setSlug(slugify(slug))} />
        </label>
        <label className="block text-[14px] tracking-wide text-mist uppercase">
          Locatie
          <input className={fieldClass} value={location} onChange={(event) => setLocation(event.target.value)} />
        </label>
        <label className="block text-[14px] tracking-wide text-mist uppercase">
          Dashboard
          <select className={fieldClass} value={dashboardId} onChange={(event) => setDashboardId(event.target.value)}>
            <option value="">Niet gekoppeld</option>
            {dashboards.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
        </label>
        <div>
          <button type="submit" className="rounded-full border border-gold/50 bg-gold/15 px-5 py-2 text-[15px] font-semibold text-gold uppercase" disabled={status === "loading"}>
            Scherm toevoegen
          </button>
        </div>
      </form>

      {editing ? (
        <form className="mt-6 border-t border-veil/12 pt-5" onSubmit={(event) => void onSave(event)}>
          <h3 className="font-display text-[22px] font-semibold">Bewerken: {editing.name}</h3>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="block text-[14px] tracking-wide text-mist uppercase">
              Naam
              <input className={fieldClass} value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} />
            </label>
            <label className="block text-[14px] tracking-wide text-mist uppercase">
              Slug
              <input className={fieldClass} value={editing.slug} onChange={(event) => setEditing({ ...editing, slug: slugifyTyping(event.target.value) })} onBlur={() => setEditing({ ...editing, slug: slugify(editing.slug) })} />
            </label>
            <label className="block text-[14px] tracking-wide text-mist uppercase">
              Locatie
              <input className={fieldClass} value={editing.location} onChange={(event) => setEditing({ ...editing, location: event.target.value })} />
            </label>
            <label className="block text-[14px] tracking-wide text-mist uppercase">
              Dashboard
              <select className={fieldClass} value={editing.dashboardId ?? ""} onChange={(event) => setEditing({ ...editing, dashboardId: event.target.value || null })}>
                <option value="">Niet gekoppeld</option>
                {dashboards.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-3 text-[16px]">
              <input type="checkbox" checked={editing.enabled} onChange={(event) => setEditing({ ...editing, enabled: event.target.checked })} />
              Scherm actief
            </label>
          </div>
          <div className="mt-4 flex gap-3">
            <button type="submit" className="rounded-full border border-gold/50 bg-gold/15 px-5 py-2 text-[15px] font-semibold text-gold uppercase">Opslaan</button>
            <button type="button" className="rounded-full border border-veil/20 px-5 py-2 text-[15px] uppercase" onClick={() => setEditing(null)}>Annuleren</button>
          </div>
        </form>
      ) : null}

      <h3 className="mt-8 font-display text-[22px] font-semibold">Recente activiteit</h3>
      <ul className="mt-3 space-y-2">
        {audit.length === 0 ? <li className="text-[15px] text-mist">Nog geen activiteit.</li> : null}
        {audit.map((entry) => (
          <li key={entry.id} className="text-[14px] text-mist">
            <span className="text-paper">{entry.action}</span> · {entry.entityType} · {entry.actor} · {formatSeen(entry.createdAt)}
          </li>
        ))}
      </ul>

      {status === "loading" ? <p className="mt-4 text-[16px] text-mist">Bezig.</p> : null}
      {message ? <p className={`mt-4 text-[16px] ${status === "error" ? "text-gold" : "text-paper"}`}>{message}</p> : null}
    </section>
  );
}
