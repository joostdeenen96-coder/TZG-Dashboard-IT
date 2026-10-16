import { useEffect, useState, type FormEvent } from "react";
import { fetchSettings, loginAdmin, logoutAdmin, saveSettings, testAdminConnection } from "../services/adminService";

type AdminPanelProps = {
  authenticated: boolean;
  onClose: () => void;
};

const fieldClass =
  "mt-1 w-full rounded-lg border border-veil/12 bg-ink px-3 py-2 text-[16px] text-paper outline-none focus:border-gold";

export function AdminPanel({ authenticated, onClose }: AdminPanelProps) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [secretSet, setSecretSet] = useState(false);
  const [siteUrl, setSiteUrl] = useState("");
  const [listName, setListName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [prtgBaseUrl, setPrtgBaseUrl] = useState("https://prtg.teunesen.local");
  const [prtgUsername, setPrtgUsername] = useState("Beheert");
  const [prtgPassword, setPrtgPassword] = useState("");
  const [prtgPasswordSet, setPrtgPasswordSet] = useState(false);
  const [prtgGroupId, setPrtgGroupId] = useState("");
  const [prtgTag, setPrtgTag] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!authenticated) return;
    let active = true;
    setStatus("loading");
    setMessage("");
    void fetchSettings()
      .then((settings) => {
        if (!active) return;
        setTenantId(settings.graph.tenantId);
        setClientId(settings.graph.clientId);
        setSecretSet(settings.graph.clientSecretSet);
        setSiteUrl(settings.sharepoint.siteUrl);
        setListName(settings.sharepoint.listName);
        setPrtgBaseUrl(settings.prtg.baseUrl || "https://prtg.teunesen.local");
        setPrtgUsername(settings.prtg.username || "Beheert");
        setPrtgPasswordSet(settings.prtg.passwordSet);
        setPrtgGroupId(settings.prtg.groupId);
        setPrtgTag(settings.prtg.tag);
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

  async function onSave(event: FormEvent) {
    event.preventDefault();
    setStatus("loading");
    setMessage("");
    try {
      const settings = await saveSettings({
        tenantId,
        clientId,
        clientSecret,
        siteUrl,
        listName,
        newPassword,
        prtgBaseUrl,
        prtgUsername,
        prtgPassword,
        prtgGroupId,
        prtgTag,
      });
      setSecretSet(settings.graph.clientSecretSet);
      setClientSecret("");
      setNewPassword("");
      setPrtgPasswordSet(settings.prtg.passwordSet);
      setPrtgPassword("");
      setPrtgBaseUrl(settings.prtg.baseUrl || "https://prtg.teunesen.local");
      setPrtgUsername(settings.prtg.username || "Beheert");
      setPrtgGroupId(settings.prtg.groupId);
      setPrtgTag(settings.prtg.tag);
      setStatus("idle");
      setMessage("Instellingen opgeslagen. Het ICT-scherm ververst PRTG bij de volgende ronde.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Opslaan mislukt.");
    }
  }

  async function onTest() {
    setStatus("loading");
    setMessage("");
    try {
      setMessage(await testAdminConnection());
      setStatus("idle");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Verbinding mislukt.");
    }
  }

  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-ink/55 backdrop-blur-xl p-8">
      <section className="tv-card flex max-h-[1280px] w-[920px] flex-col overflow-hidden px-8 py-6">
        <div className="flex shrink-0 items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-[36px] leading-none font-semibold tracking-[-0.015em]">Beheer</h2>
            <p className="mt-2 text-[16px] text-mist">API-koppelingen voor dit scherm, inclusief PRTG voor `/ict`.</p>
          </div>
          <button type="button" className="text-[16px] text-mist hover:text-paper" onClick={onClose}>
            Sluiten
          </button>
        </div>

        {authenticated ? (
          <form className="mt-5 min-h-0 flex-1 overflow-y-auto pr-1" onSubmit={(event) => void onSave(event)}>
            <p className="text-[14px] tracking-wide text-mist uppercase">Microsoft Graph</p>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-3">
              <label className="text-[14px] tracking-wide text-mist uppercase">
                Tenant-id
                <input className={fieldClass} value={tenantId} onChange={(event) => setTenantId(event.target.value)} />
              </label>
              <label className="text-[14px] tracking-wide text-mist uppercase">
                Client-id
                <input className={fieldClass} value={clientId} onChange={(event) => setClientId(event.target.value)} />
              </label>
              <label className="col-span-2 text-[14px] tracking-wide text-mist uppercase">
                Client secret {secretSet ? "(ingevuld, leeg laten om te bewaren)" : ""}
                <input
                  className={fieldClass}
                  type="password"
                  value={clientSecret}
                  autoComplete="new-password"
                  onChange={(event) => setClientSecret(event.target.value)}
                />
              </label>
              <label className="text-[14px] tracking-wide text-mist uppercase">
                SharePoint-site
                <input className={fieldClass} value={siteUrl} onChange={(event) => setSiteUrl(event.target.value)} />
              </label>
              <label className="text-[14px] tracking-wide text-mist uppercase">
                Lijst
                <input className={fieldClass} value={listName} onChange={(event) => setListName(event.target.value)} />
              </label>
            </div>

            <p className="mt-6 text-[14px] tracking-wide text-mist uppercase">PRTG (ICT-scherm)</p>
            <p className="mt-1 text-[15px] text-mist">
              Groep-ID is het nummer uit de PRTG-URL (`group.htm?id=…`). Root is `0`.
            </p>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-3">
              <label className="col-span-2 text-[14px] tracking-wide text-mist uppercase">
                PRTG-adres
                <input
                  className={fieldClass}
                  value={prtgBaseUrl}
                  placeholder="https://prtg.teunesen.local"
                  onChange={(event) => setPrtgBaseUrl(event.target.value)}
                />
              </label>
              <label className="text-[14px] tracking-wide text-mist uppercase">
                Gebruiker
                <input
                  className={fieldClass}
                  value={prtgUsername}
                  onChange={(event) => setPrtgUsername(event.target.value)}
                />
              </label>
              <label className="text-[14px] tracking-wide text-mist uppercase">
                Wachtwoord {prtgPasswordSet ? "(ingevuld, leeg laten om te bewaren)" : ""}
                <input
                  className={fieldClass}
                  type="password"
                  value={prtgPassword}
                  autoComplete="new-password"
                  onChange={(event) => setPrtgPassword(event.target.value)}
                />
              </label>
              <label className="text-[14px] tracking-wide text-mist uppercase">
                Groep-ID
                <input
                  className={fieldClass}
                  value={prtgGroupId}
                  placeholder="bijv. 0"
                  onChange={(event) => setPrtgGroupId(event.target.value)}
                />
              </label>
              <label className="text-[14px] tracking-wide text-mist uppercase">
                Tag (optioneel)
                <input className={fieldClass} value={prtgTag} onChange={(event) => setPrtgTag(event.target.value)} />
              </label>
            </div>

            <label className="mt-6 block text-[14px] tracking-wide text-mist uppercase">
              Nieuw wachtwoord (beheer)
              <input
                className={fieldClass}
                type="password"
                value={newPassword}
                autoComplete="new-password"
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </label>

            <div className="mt-4 flex items-center gap-3 pb-1">
              <button
                type="submit"
                className="rounded-full border border-gold/50 bg-gold/15 px-5 py-2 text-[16px] font-semibold tracking-[0.02em] text-gold uppercase"
                disabled={status === "loading"}
              >
                Opslaan
              </button>
              <button
                type="button"
                className="rounded-full border border-slate/50 px-5 py-2 text-[16px] font-bold tracking-[0.02em] text-paper uppercase"
                disabled={status === "loading"}
                onClick={() => void onTest()}
              >
                Verbinding testen
              </button>
              <button
                type="button"
                className="ml-auto text-[16px] text-mist hover:text-paper"
                onClick={() => void logoutAdmin()}
              >
                Afmelden
              </button>
            </div>
          </form>
        ) : (
          <form className="mt-5 grid gap-3" onSubmit={(event) => void onLogin(event)}>
            <label className="text-[14px] tracking-wide text-mist uppercase">
              Gebruikersnaam
              <input className={fieldClass} value={username} onChange={(event) => setUsername(event.target.value)} />
            </label>
            <label className="text-[14px] tracking-wide text-mist uppercase">
              Wachtwoord
              <input
                className={fieldClass}
                type="password"
                value={password}
                autoComplete="current-password"
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <p className="text-[15px] text-mist">Eerste aanmelding: admin / teunesen. Wijzig het wachtwoord daarna.</p>
            <button
              type="submit"
              className="mt-1 w-fit rounded-full border border-gold/50 bg-gold/15 px-5 py-2 text-[16px] font-semibold tracking-[0.02em] text-gold uppercase"
              disabled={status === "loading"}
            >
              Inloggen
            </button>
          </form>
        )}

        {status === "loading" ? <p className="mt-4 shrink-0 text-[16px] text-mist">Bezig.</p> : null}
        {message ? (
          <p className={`mt-4 shrink-0 text-[16px] ${status === "error" ? "text-gold" : "text-paper"}`}>{message}</p>
        ) : null}
      </section>
    </div>
  );
}
