import { useEffect, useState } from "react";
import {
  fetchShipPlanningAdminSettings,
  saveShipPlanningAdminSettings,
} from "../services/shipPlanningService";
import type { ShipPlanningAdminSettings, ShipPlanningSettings } from "../types/shipPlanning";

const fieldClass =
  "mt-1 w-full rounded-lg border border-veil/12 bg-ink px-3 py-2 text-[16px] text-paper outline-none focus:border-gold";

const empty: ShipPlanningAdminSettings = {
  enabled: true,
  displayMode: "Tomorrow",
  refreshIntervalSeconds: 300,
  maxRows: 80,
  credentialStatus: "not-configured",
};

export function AdminShipPlanningSection({ authenticated }: { authenticated: boolean }) {
  const [settings, setSettings] = useState<ShipPlanningAdminSettings>(empty);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!authenticated) return;
    let active = true;
    void fetchShipPlanningAdminSettings()
      .then((next) => {
        if (active) setSettings(next);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(true);
        setMessage(reason instanceof Error ? reason.message : "Schepenplanning niet geladen.");
      });
    return () => {
      active = false;
    };
  }, [authenticated]);

  async function onSave() {
    setError(false);
    setMessage("");
    const body: ShipPlanningSettings = {
      enabled: settings.enabled,
      displayMode: settings.displayMode,
      refreshIntervalSeconds: Number(settings.refreshIntervalSeconds),
      maxRows: Number(settings.maxRows),
    };
    try {
      const saved = await saveShipPlanningAdminSettings(body);
      setSettings(saved);
      setMessage("Schepenplanning opgeslagen.");
    } catch (reason) {
      setError(true);
      setMessage(reason instanceof Error ? reason.message : "Opslaan mislukt.");
    }
  }

  if (!authenticated) return null;

  return (
    <section className="tv-card mt-6 px-5 py-4" data-testid="admin-ship-planning">
      <h2 className="font-display text-[26px] leading-none font-semibold tracking-[-0.015em]">Schepenplanning</h2>
      <p className="mt-2 text-[15px] text-mist">
        Credentials blijven environment secrets. Dit scherm toont alleen of ze geconfigureerd zijn.
      </p>
      <p className="mt-2 text-[15px]">
        Credentialstatus:{" "}
        <span className={settings.credentialStatus === "configured" ? "text-gold" : "text-mist"}>
          {settings.credentialStatus === "configured" ? "Configured" : "Not configured"}
        </span>
      </p>
      <label className="mt-4 flex items-center gap-3 text-[16px]">
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(event) => setSettings((current) => ({ ...current, enabled: event.target.checked }))}
        />
        Enabled
      </label>
      <label className="mt-3 block text-[14px] tracking-wide text-mist uppercase">
        Display mode
        <select
          className={fieldClass}
          value={settings.displayMode}
          onChange={(event) =>
            setSettings((current) => ({
              ...current,
              displayMode: event.target.value as ShipPlanningSettings["displayMode"],
            }))
          }
        >
          <option value="Tomorrow">Tomorrow</option>
          <option value="TodayAndTomorrow">TodayAndTomorrow</option>
          <option value="Auto">Auto</option>
        </select>
      </label>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <label className="block text-[14px] tracking-wide text-mist uppercase">
          Refresh interval
          <input
            className={fieldClass}
            type="number"
            min={60}
            max={3600}
            value={settings.refreshIntervalSeconds}
            onChange={(event) =>
              setSettings((current) => ({ ...current, refreshIntervalSeconds: Number(event.target.value) }))
            }
          />
        </label>
        <label className="block text-[14px] tracking-wide text-mist uppercase">
          Max rows
          <input
            className={fieldClass}
            type="number"
            min={4}
            max={200}
            value={settings.maxRows}
            onChange={(event) => setSettings((current) => ({ ...current, maxRows: Number(event.target.value) }))}
          />
        </label>
      </div>
      <button
        type="button"
        className="mt-4 rounded-full border border-gold/50 bg-gold/15 px-5 py-2 text-[16px] font-semibold tracking-[0.02em] text-gold uppercase"
        onClick={() => void onSave()}
      >
        Opslaan
      </button>
      {message ? <p className={`mt-3 text-[15px] ${error ? "text-gold" : "text-paper"}`}>{message}</p> : null}
    </section>
  );
}
