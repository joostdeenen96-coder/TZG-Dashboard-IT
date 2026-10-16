import { useEffect, useState, type FormEvent, type MouseEvent } from "react";
import {
  fetchDashboardConfig,
  loginAdmin,
  saveDashboardConfig,
  testDashboardConnection,
  useAdminSession,
  type DashboardConfig,
} from "../services/adminService";

const emptyConfig: DashboardConfig = {
  sharepointDiesel: {
    siteUrl: "https://teunesen.sharepoint.com/sites/Facturatie",
    lijstnaam: "Dieseltoeslagen Asvervoer",
  },
  sharepointNieuws: {
    siteUrl: "https://teunesen.sharepoint.com/sites/wt-nieuws",
    bibliotheek: "Sitepagina's",
  },
  weer: { plaatsnaam: "Gennep" },
  dashboard: { refreshInterval: 300, aantalNieuwsitems: 3 },
  prtg: { groupId: "", tag: "" },
};

const fieldClass =
  "mt-1 w-full rounded-lg border border-veil/12 bg-ink px-3 py-2 text-[16px] text-paper outline-none focus:border-gold";

function goToDashboard(event: MouseEvent<HTMLAnchorElement>) {
  event.preventDefault();
  window.history.pushState({}, "", "/");
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function AdminPage() {
  const authenticated = useAdminSession();
  const [config, setConfig] = useState<DashboardConfig>(emptyConfig);
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "saved">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!authenticated) return;
    let active = true;
    setStatus("loading");
    setMessage("");
    void fetchDashboardConfig()
      .then((next) => {
        if (!active) return;
        setConfig(next);
        setStatus("idle");
      })
      .catch((error: unknown) => {
        if (!active) return;
        setStatus("error");
        setMessage(error instanceof Error ? error.message : "Instellingen niet geladen.");
      });
    return () => {
      active = false;
    };
  }, [authenticated]);

  function updateDiesel(patch: Partial<DashboardConfig["sharepointDiesel"]>) {
    setConfig((current) => ({ ...current, sharepointDiesel: { ...current.sharepointDiesel, ...patch } }));
  }

  function updateNieuws(patch: Partial<DashboardConfig["sharepointNieuws"]>) {
    setConfig((current) => ({ ...current, sharepointNieuws: { ...current.sharepointNieuws, ...patch } }));
  }

  async function onLogin(event: FormEvent) {
    event.preventDefault();
    setStatus("loading");
    setMessage("");
    try {
      await loginAdmin(username, password);
      setPassword("");
      setStatus("idle");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Aanmelden mislukt.");
    }
  }

  async function onSave() {
    setStatus("loading");
    setMessage("");
    try {
      const saved = await saveDashboardConfig(config);
      setConfig(saved);
      setStatus("saved");
      setMessage("Instellingen opgeslagen in config.json.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Opslaan mislukt.");
    }
  }

  async function onTest() {
    setStatus("loading");
    setMessage("");
    try {
      const result = await testDashboardConnection(config);
      setStatus("saved");
      setMessage(result);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Verbinding mislukt.");
    }
  }

  return (
    <div className="fixed inset-0 overflow-y-auto bg-ink text-paper">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(880px_240px_at_0%_0%,rgba(230,179,37,0.12),transparent_60%),radial-gradient(720px_280px_at_100%_0%,rgba(109,127,146,0.16),transparent_58%)]" />
      <div className="relative mx-auto flex min-h-full w-full max-w-5xl flex-col px-4 py-6 sm:px-6">
        <header className="flex items-center justify-between gap-4 border-b border-slate/30 pb-4">
          <img src="/teunesen-logo.png" alt="Teunesen" className="h-12 w-auto" />
          <div className="text-right">
            <h1 className="font-display text-[36px] leading-none font-semibold tracking-[-0.015em]">Beheer</h1>
            <a href="/" className="mt-1 inline-block text-[15px] text-mist hover:text-paper" onClick={goToDashboard}>
              Naar het scherm
            </a>
          </div>
        </header>

        {authenticated ? (
          <form
            className="mt-6 grid gap-4 md:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              void onSave();
            }}
          >
            <section className="tv-card px-5 py-4">
              <h2 className="font-display text-[26px] leading-none font-semibold tracking-[-0.015em]">
                SharePoint Dieseltoeslag
              </h2>
              <label className="mt-4 block text-[14px] tracking-wide text-mist uppercase">
                Site URL
                <input
                  className={fieldClass}
                  value={config.sharepointDiesel.siteUrl}
                  onChange={(event) => updateDiesel({ siteUrl: event.target.value })}
                />
              </label>
              <label className="mt-3 block text-[14px] tracking-wide text-mist uppercase">
                Lijstnaam
                <input
                  className={fieldClass}
                  value={config.sharepointDiesel.lijstnaam}
                  onChange={(event) => updateDiesel({ lijstnaam: event.target.value })}
                />
              </label>
            </section>

            <section className="tv-card px-5 py-4">
              <h2 className="font-display text-[26px] leading-none font-semibold tracking-[-0.015em]">
                SharePoint Nieuws
              </h2>
              <label className="mt-4 block text-[14px] tracking-wide text-mist uppercase">
                Site URL
                <input
                  className={fieldClass}
                  value={config.sharepointNieuws.siteUrl}
                  onChange={(event) => updateNieuws({ siteUrl: event.target.value })}
                />
              </label>
              <label className="mt-3 block text-[14px] tracking-wide text-mist uppercase">
                Bibliotheek
                <input
                  className={fieldClass}
                  value={config.sharepointNieuws.bibliotheek}
                  onChange={(event) => updateNieuws({ bibliotheek: event.target.value })}
                />
              </label>
            </section>

            <section className="tv-card px-5 py-4">
              <h2 className="font-display text-[26px] leading-none font-semibold tracking-[-0.015em]">Weer</h2>
              <label className="mt-4 block text-[14px] tracking-wide text-mist uppercase">
                Plaatsnaam
                <input
                  className={fieldClass}
                  value={config.weer.plaatsnaam}
                  onChange={(event) =>
                    setConfig((current) => ({ ...current, weer: { plaatsnaam: event.target.value } }))
                  }
                />
              </label>
            </section>

            <section className="tv-card px-5 py-4">
              <h2 className="font-display text-[26px] leading-none font-semibold tracking-[-0.015em]">Dashboard</h2>
              <label className="mt-4 block text-[14px] tracking-wide text-mist uppercase">
                Refresh interval
                <input
                  className={fieldClass}
                  type="number"
                  min={15}
                  max={3600}
                  value={config.dashboard.refreshInterval}
                  onChange={(event) =>
                    setConfig((current) => ({
                      ...current,
                      dashboard: { ...current.dashboard, refreshInterval: Number(event.target.value) },
                    }))
                  }
                />
              </label>
              <p className="mt-1 text-[13px] text-mist">Seconden, van 15 tot 3600.</p>
              <label className="mt-3 block text-[14px] tracking-wide text-mist uppercase">
                Aantal nieuwsitems
                <input
                  className={fieldClass}
                  type="number"
                  min={1}
                  max={5}
                  value={config.dashboard.aantalNieuwsitems}
                  onChange={(event) =>
                    setConfig((current) => ({
                      ...current,
                      dashboard: { ...current.dashboard, aantalNieuwsitems: Number(event.target.value) },
                    }))
                  }
                />
              </label>
            </section>

            <section className="tv-card px-5 py-4 md:col-span-2">
              <h2 className="font-display text-[26px] leading-none font-semibold tracking-[-0.015em]">
                PRTG (ICT-scherm)
              </h2>
              <p className="mt-2 text-[15px] text-mist">
                Filter voor `/ict`. Open in PRTG de gewenste groep; in de adresbalk staat `id=1234` — dat nummer hoort
                bij Groep-ID. Of vul een tag in. Adres en login staan in `.env` (`PRTG_BASE_URL=https://prtg.teunesen.local`,
                zonder `/index.htm`).
              </p>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <label className="block text-[14px] tracking-wide text-mist uppercase">
                  Groep-ID
                  <input
                    className={fieldClass}
                    value={config.prtg.groupId}
                    placeholder="bijv. 1234"
                    onChange={(event) =>
                      setConfig((current) => ({
                        ...current,
                        prtg: { ...current.prtg, groupId: event.target.value },
                      }))
                    }
                  />
                </label>
                <label className="block text-[14px] tracking-wide text-mist uppercase">
                  Tag
                  <input
                    className={fieldClass}
                    value={config.prtg.tag}
                    placeholder="optioneel"
                    onChange={(event) =>
                      setConfig((current) => ({
                        ...current,
                        prtg: { ...current.prtg, tag: event.target.value },
                      }))
                    }
                  />
                </label>
              </div>
            </section>

            <div className="flex flex-col gap-3 sm:flex-row md:col-span-2">
              <button
                type="button"
                className="rounded-full border border-slate/50 px-5 py-2 text-[16px] font-bold tracking-[0.02em] text-paper uppercase"
                disabled={status === "loading"}
                onClick={() => void onTest()}
              >
                Test verbinding
              </button>
              <button
                type="submit"
                className="rounded-full border border-gold/50 bg-gold/15 px-5 py-2 text-[16px] font-semibold tracking-[0.02em] text-gold uppercase"
                disabled={status === "loading"}
              >
                Opslaan
              </button>
            </div>
          </form>
        ) : (
          <form className="tv-card mt-6 max-w-md px-5 py-4" onSubmit={(event) => void onLogin(event)}>
            <h2 className="font-display text-[26px] leading-none font-semibold tracking-[-0.015em]">Aanmelden</h2>
            <label className="mt-4 block text-[14px] tracking-wide text-mist uppercase">
              Gebruikersnaam
              <input className={fieldClass} value={username} onChange={(event) => setUsername(event.target.value)} />
            </label>
            <label className="mt-3 block text-[14px] tracking-wide text-mist uppercase">
              Wachtwoord
              <input
                className={fieldClass}
                type="password"
                value={password}
                autoComplete="current-password"
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <button
              type="submit"
              className="mt-4 rounded-full border border-gold/50 bg-gold/15 px-5 py-2 text-[16px] font-semibold tracking-[0.02em] text-gold uppercase"
              disabled={status === "loading"}
            >
              Inloggen
            </button>
          </form>
        )}

        {status === "loading" ? <p className="mt-4 text-[16px] text-mist">Bezig.</p> : null}
        {message ? (
          <p className={`mt-4 text-[16px] ${status === "error" ? "text-gold" : "text-paper"}`}>{message}</p>
        ) : null}
      </div>
    </div>
  );
}
