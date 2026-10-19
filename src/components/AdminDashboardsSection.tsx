import { useCallback, useEffect, useState, type FormEvent, type MouseEvent } from "react";
import {
  createDashboard,
  deleteDashboard,
  duplicateDashboard,
  fetchDashboards,
  updateDashboard,
} from "../services/dashboardApi";
import type { DashboardDefinition, DashboardWidget, DashboardWidgetType } from "../types/dashboard";

const fieldClass =
  "mt-1 w-full rounded-lg border border-veil/12 bg-ink px-3 py-2 text-[16px] text-paper outline-none focus:border-gold";

const ADDABLE_WIDGET_TYPES: Array<{ type: DashboardWidgetType; label: string }> = [
  { type: "text", label: "Tekst" },
  { type: "clock", label: "Klok" },
  { type: "weather", label: "Weer" },
  { type: "news", label: "Nieuws" },
  { type: "waterlevels", label: "Waterstanden" },
  { type: "diesel", label: "Diesel" },
  { type: "slideshow", label: "Slideshow" },
  { type: "agenda", label: "Agenda" },
  { type: "prtg", label: "PRTG" },
];

function defaultWidget(type: DashboardWidgetType, order: number): DashboardWidget {
  const title = ADDABLE_WIDGET_TYPES.find((item) => item.type === type)?.label ?? type;
  const dataSource =
    type === "clock" || type === "text" || type === "slideshow"
      ? ({ kind: "none" } as const)
      : ({ kind: "builtin", name: type === "prtg" ? "prtg" : type === "agenda" ? "agenda" : type === "news" ? "news" : type === "diesel" ? "diesel" : type === "waterlevels" ? "waterlevels" : type === "weather" ? "weather" : "none" } as const);
  return {
    id: `${type}-${Date.now()}`,
    type,
    title,
    enabled: true,
    position: { order },
    layout: { area: type === "agenda" ? "footer" : type === "clock" || type === "weather" ? "header" : "main", width: "full" },
    dataSource,
    settings: type === "text" ? { body: "Welkom op dit scherm." } : {},
    refreshIntervalSeconds: 300,
  };
}

function goToPath(path: string, event?: MouseEvent<HTMLAnchorElement | HTMLButtonElement>) {
  event?.preventDefault();
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

type AdminDashboardsSectionProps = {
  authenticated: boolean;
};

export function AdminDashboardsSection({ authenticated }: AdminDashboardsSectionProps) {
  const [items, setItems] = useState<DashboardDefinition[]>([]);
  const [editing, setEditing] = useState<DashboardDefinition | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "saved">("idle");
  const [message, setMessage] = useState("");
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [addWidgetType, setAddWidgetType] = useState<DashboardWidgetType>("text");

  const reload = useCallback(async () => {
    const list = await fetchDashboards();
    setItems(list);
  }, []);

  useEffect(() => {
    if (!authenticated) return;
    let active = true;
    setStatus("loading");
    void reload()
      .then(() => {
        if (!active) return;
        setStatus("idle");
      })
      .catch((error: unknown) => {
        if (!active) return;
        setStatus("error");
        setMessage(error instanceof Error ? error.message : "Dashboards niet geladen.");
      });
    return () => {
      active = false;
    };
  }, [authenticated, reload]);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setStatus("loading");
    setMessage("");
    try {
      const name = newName.trim() || "Nieuw dashboard";
      const slug = newSlug.trim() || slugify(name);
      const created = await createDashboard({
        name,
        slug,
        description: "",
        enabled: true,
        layout: { preset: "stack", stageWidth: 2560, stageHeight: 1440 },
        widgets: [],
      });
      setNewName("");
      setNewSlug("");
      await reload();
      setEditing(structuredClone(created));
      setStatus("saved");
      setMessage("Dashboard aangemaakt. Voeg hieronder een widget toe en sla op.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Aanmaken mislukt.");
    }
  }

  function addWidgetToEditing() {
    if (!editing) return;
    const maxOrder = editing.widgets.reduce((max, widget) => Math.max(max, widget.position.order), 0);
    const widget = defaultWidget(addWidgetType, maxOrder + 10);
    setEditing({ ...editing, widgets: [...editing.widgets, widget] });
  }

  async function onDuplicate(item: DashboardDefinition) {
    setStatus("loading");
    setMessage("");
    try {
      const baseSlug = `${item.slug}-kopie`;
      let slug = baseSlug;
      let n = 2;
      while (items.some((row) => row.slug === slug)) {
        slug = `${baseSlug}-${n}`;
        n += 1;
      }
      await duplicateDashboard(item, `${item.name} (kopie)`, slug);
      await reload();
      setStatus("saved");
      setMessage("Dashboard gedupliceerd.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Dupliceren mislukt.");
    }
  }

  async function onDelete(item: DashboardDefinition) {
    if (!window.confirm(`Dashboard “${item.name}” verwijderen? Dit kan niet ongedaan worden gemaakt.`)) return;
    setStatus("loading");
    setMessage("");
    try {
      await deleteDashboard(item.id);
      if (editing?.id === item.id) setEditing(null);
      await reload();
      setStatus("saved");
      setMessage("Dashboard verwijderd.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Verwijderen mislukt.");
    }
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    setStatus("loading");
    setMessage("");
    try {
      const saved = await updateDashboard(editing.id, {
        name: editing.name,
        slug: editing.slug,
        description: editing.description,
        enabled: editing.enabled,
        widgets: editing.widgets,
        theme: editing.theme,
        layout: editing.layout,
      });
      setEditing(saved);
      await reload();
      setStatus("saved");
      setMessage("Dashboard opgeslagen.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Opslaan mislukt.");
    }
  }

  function moveWidget(widgetId: string, direction: -1 | 1) {
    if (!editing) return;
    const sorted = [...editing.widgets].sort((a, b) => a.position.order - b.position.order);
    const index = sorted.findIndex((item) => item.id === widgetId);
    const swapWith = index + direction;
    if (index < 0 || swapWith < 0 || swapWith >= sorted.length) return;
    const a = sorted[index]!;
    const b = sorted[swapWith]!;
    const nextOrderA = b.position.order;
    const nextOrderB = a.position.order;
    const widgets = editing.widgets.map((widget) => {
      if (widget.id === a.id) return { ...widget, position: { ...widget.position, order: nextOrderA } };
      if (widget.id === b.id) return { ...widget, position: { ...widget.position, order: nextOrderB } };
      return widget;
    });
    setEditing({ ...editing, widgets });
  }

  function toggleWidget(widgetId: string) {
    if (!editing) return;
    const widgets = editing.widgets.map((widget) =>
      widget.id === widgetId ? { ...widget, enabled: !widget.enabled } : widget,
    );
    setEditing({ ...editing, widgets });
  }

  if (!authenticated) return null;

  return (
    <section className="tv-card mt-6 px-5 py-4 md:col-span-2">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-[26px] leading-none font-semibold tracking-[-0.015em]">Dashboards</h2>
          <p className="mt-2 text-[15px] text-mist">
            Beheer meerdere schermen. Preview opent /display/{"{slug}"}. Geen drag-and-drop-editor.
          </p>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-[15px]">
          <thead>
            <tr className="border-b border-veil/12 text-mist">
              <th className="py-2 pr-3 font-medium">Naam</th>
              <th className="py-2 pr-3 font-medium">Slug</th>
              <th className="py-2 pr-3 font-medium">Status</th>
              <th className="py-2 pr-3 font-medium">Widgets</th>
              <th className="py-2 font-medium">Acties</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-veil/8">
                <td className="py-3 pr-3">{item.name}</td>
                <td className="py-3 pr-3 font-mono text-[14px] text-mist">{item.slug}</td>
                <td className="py-3 pr-3">{item.enabled ? "Actief" : "Inactief"}</td>
                <td className="py-3 pr-3">{item.widgets.length}</td>
                <td className="py-3">
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={`/display/${item.slug}`}
                      className="rounded-full border border-veil/20 px-3 py-1 text-[13px] uppercase"
                      onClick={(event) => goToPath(`/display/${item.slug}`, event)}
                    >
                      Open
                    </a>
                    <button
                      type="button"
                      className="rounded-full border border-veil/20 px-3 py-1 text-[13px] uppercase"
                      onClick={() => setEditing(structuredClone(item))}
                    >
                      Bewerken
                    </button>
                    <button
                      type="button"
                      className="rounded-full border border-veil/20 px-3 py-1 text-[13px] uppercase"
                      onClick={() => void onDuplicate(item)}
                    >
                      Dupliceer
                    </button>
                    <button
                      type="button"
                      className="rounded-full border border-gold/40 px-3 py-1 text-[13px] text-gold uppercase"
                      onClick={() => void onDelete(item)}
                    >
                      Verwijder
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form className="mt-5 grid gap-3 md:grid-cols-[1fr_1fr_auto]" onSubmit={(event) => void onCreate(event)}>
        <label className="block text-[14px] tracking-wide text-mist uppercase">
          Nieuw dashboard — naam
          <input
            className={fieldClass}
            value={newName}
            onChange={(event) => {
              setNewName(event.target.value);
              if (!newSlug) setNewSlug(slugify(event.target.value));
            }}
          />
        </label>
        <label className="block text-[14px] tracking-wide text-mist uppercase">
          Slug
          <input className={fieldClass} value={newSlug} onChange={(event) => setNewSlug(slugify(event.target.value))} />
        </label>
        <div className="flex items-end">
          <button
            type="submit"
            className="rounded-full border border-gold/50 bg-gold/15 px-5 py-2 text-[15px] font-semibold tracking-[0.02em] text-gold uppercase"
            disabled={status === "loading"}
          >
            Toevoegen
          </button>
        </div>
      </form>

      {editing ? (
        <form className="mt-6 border-t border-veil/12 pt-5" onSubmit={(event) => void saveEdit(event)}>
          <h3 className="font-display text-[22px] font-semibold">Bewerken: {editing.name}</h3>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="block text-[14px] tracking-wide text-mist uppercase">
              Naam
              <input
                className={fieldClass}
                value={editing.name}
                onChange={(event) => setEditing({ ...editing, name: event.target.value })}
              />
            </label>
            <label className="block text-[14px] tracking-wide text-mist uppercase">
              Slug
              <input
                className={fieldClass}
                value={editing.slug}
                onChange={(event) => setEditing({ ...editing, slug: slugify(event.target.value) })}
              />
            </label>
            <label className="block text-[14px] tracking-wide text-mist uppercase md:col-span-2">
              Beschrijving
              <input
                className={fieldClass}
                value={editing.description}
                onChange={(event) => setEditing({ ...editing, description: event.target.value })}
              />
            </label>
            <label className="flex items-center gap-3 text-[16px] text-paper">
              <input
                type="checkbox"
                checked={editing.enabled}
                onChange={(event) => setEditing({ ...editing, enabled: event.target.checked })}
              />
              Dashboard actief
            </label>
            <div className="flex items-center gap-2">
              <a
                href={`/display/${editing.slug}`}
                className="rounded-full border border-veil/20 px-4 py-2 text-[14px] uppercase"
                onClick={(event) => goToPath(`/display/${editing.slug}`, event)}
              >
                Preview
              </a>
            </div>
          </div>

          <h4 className="mt-5 text-[14px] tracking-wide text-mist uppercase">Widgets</h4>
          <div className="mt-2 flex flex-wrap items-end gap-3">
            <label className="block min-w-[180px] flex-1 text-[14px] tracking-wide text-mist uppercase">
              Widgettype toevoegen
              <select
                className={fieldClass}
                value={addWidgetType}
                onChange={(event) => setAddWidgetType(event.target.value as DashboardWidgetType)}
              >
                {ADDABLE_WIDGET_TYPES.map((item) => (
                  <option key={item.type} value={item.type}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="rounded-full border border-veil/20 px-4 py-2 text-[14px] uppercase"
              onClick={addWidgetToEditing}
            >
              Widget toevoegen
            </button>
          </div>
          <ul className="mt-3 space-y-2">
            {[...editing.widgets]
              .sort((a, b) => a.position.order - b.position.order)
              .map((widget: DashboardWidget) => (
                <li
                  key={widget.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-veil/10 px-3 py-2"
                >
                  <div>
                    <p className="text-[16px]">{widget.title}</p>
                    <p className="text-[13px] text-mist">
                      {widget.type} · volgorde {widget.position.order}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded-full border border-veil/20 px-3 py-1 text-[12px] uppercase"
                      onClick={() => moveWidget(widget.id, -1)}
                    >
                      Omhoog
                    </button>
                    <button
                      type="button"
                      className="rounded-full border border-veil/20 px-3 py-1 text-[12px] uppercase"
                      onClick={() => moveWidget(widget.id, 1)}
                    >
                      Omlaag
                    </button>
                    <button
                      type="button"
                      className="rounded-full border border-veil/20 px-3 py-1 text-[12px] uppercase"
                      onClick={() => toggleWidget(widget.id)}
                    >
                      {widget.enabled ? "Verbergen" : "Tonen"}
                    </button>
                  </div>
                </li>
              ))}
          </ul>
          {editing.widgets.length === 0 ? (
            <p className="mt-2 text-[15px] text-mist">Nog geen widgets. Voeg er hierboven minstens één toe.</p>
          ) : null}

          <div className="mt-4 flex gap-3">
            <button
              type="submit"
              className="rounded-full border border-gold/50 bg-gold/15 px-5 py-2 text-[15px] font-semibold text-gold uppercase"
              disabled={status === "loading"}
            >
              Opslaan
            </button>
            <button
              type="button"
              className="rounded-full border border-veil/20 px-5 py-2 text-[15px] uppercase"
              onClick={() => setEditing(null)}
            >
              Annuleren
            </button>
          </div>
        </form>
      ) : null}

      {status === "loading" ? <p className="mt-4 text-[16px] text-mist">Bezig.</p> : null}
      {message ? (
        <p className={`mt-4 text-[16px] ${status === "error" ? "text-gold" : "text-paper"}`}>{message}</p>
      ) : null}
    </section>
  );
}
