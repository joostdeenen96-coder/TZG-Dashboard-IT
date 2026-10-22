import { useMemo, useState } from "react";
import { formatQuantity } from "../shipPlanning/formatQuantity";
import { groupEntries } from "../shipPlanning/groupEntries";
import { groupSizes, resolvePlanningPresentation } from "../shipPlanning/layoutDensity";
import { useShipPlanning } from "../services/shipPlanningService";
import type { ShipPlanningDay, ShipPlanningEntry } from "../types/shipPlanning";
import { ShipPlanningDetailDialog } from "./ShipPlanningDetailDialog";

const dateLabel = new Intl.DateTimeFormat("nl-NL", {
  timeZone: "Europe/Amsterdam",
  weekday: "long",
  day: "numeric",
  month: "long",
});

function dayHeading(day: ShipPlanningDay, fallback: string) {
  const stamp = Date.parse(`${day.date}T12:00:00`);
  if (!Number.isFinite(stamp)) return fallback;
  return dateLabel.format(new Date(stamp));
}

const columns = ["Tijd", "Klant", "Losplaats", "Conditie", "Product", "Hoeveelheid", "Schip"] as const;

const columnClass =
  "grid grid-cols-[72px_minmax(0,1.3fr)_minmax(0,1.2fr)_minmax(0,0.9fr)_minmax(0,1.1fr)_92px_minmax(0,1fr)] items-center gap-2 px-2";

function ColumnHead() {
  return (
    <div className={`${columnClass} h-4 text-[12px] leading-none font-semibold tracking-[0.08em] text-mist uppercase`}>
      {columns.map((label) => (
        <span key={label}>{label}</span>
      ))}
    </div>
  );
}

/** Eén knip in bronvolgorde zodat de hoogste kolom zo kort mogelijk blijft. */
function splitGroups<T extends { entries: unknown[] }>(groups: T[], columnsCount: 1 | 2, rowHeight: number) {
  if (columnsCount === 1 || groups.length < 2) return [groups];
  const weights = groups.map((group) => 24 + group.entries.length * rowHeight);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let left = 0;
  let bestMid = 1;
  let bestMax = Number.POSITIVE_INFINITY;
  for (let mid = 1; mid < groups.length; mid += 1) {
    left += weights[mid - 1] ?? 0;
    const max = Math.max(left, total - left);
    if (max < bestMax) {
      bestMax = max;
      bestMid = mid;
    }
  }
  return [groups.slice(0, bestMid), groups.slice(bestMid)];
}

function PlanningTable({
  day,
  title,
  rowHeight,
  columnsCount,
  onOpen,
}: {
  day: ShipPlanningDay;
  title: string;
  rowHeight: number;
  columnsCount: 1 | 2;
  onOpen: (entry: ShipPlanningEntry, location: string) => void;
}) {
  const groups = groupEntries(day.entries);
  const columnsOfGroups = splitGroups(groups, columnsCount, rowHeight);
  return (
    <section className="min-w-0">
      {title ? (
        <h3 className="font-display text-[28px] leading-none font-semibold tracking-[0.04em] text-gold uppercase">{title}</h3>
      ) : null}
      <div className={`mt-2 grid gap-4 ${columnsCount === 2 ? "grid-cols-2" : "grid-cols-1"}`} data-columns={columnsCount}>
        {columnsOfGroups.map((column, columnIndex) => (
          <div key={column[0]?.location ?? columnIndex} className="min-w-0">
            <ColumnHead />
            {column.map((group) => (
          <section key={group.location} className="mb-1" data-location={group.location}>
            <h4 className="truncate bg-veil/[0.06] px-2 py-0.5 font-display text-[16px] leading-none font-semibold tracking-[0.08em] text-paper uppercase">
              {group.location}
            </h4>
            <ul>
              {group.entries.map((entry, index) => (
                <li key={entry.sourceId ?? `${group.location}-${index}`}>
                  <button
                    type="button"
                    className={`${columnClass} w-full text-left leading-none hover:bg-gold/10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-gold`}
                    style={{ height: rowHeight }}
                    onClick={() => onOpen(entry, group.location)}
                  >
                    <span className="truncate font-display text-[16px] font-semibold tabular-nums">{entry.time ?? "—"}</span>
                    <span className="truncate text-[16px]">{entry.customer ?? "—"}</span>
                    <span className="truncate text-[16px]">{entry.unloadingLocation ?? "—"}</span>
                    <span className="truncate text-[16px]">{entry.condition ?? "—"}</span>
                    <span className="truncate text-[16px]">{entry.product ?? "—"}</span>
                    <span className="truncate text-[16px] tabular-nums">{formatQuantity(entry) ?? "—"}</span>
                    <span className="truncate text-[16px]">{entry.vessel ?? "—"}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

export function ShipPlanningBoard() {
  const { settings, data, error } = useShipPlanning();
  const [selected, setSelected] = useState<{ entry: ShipPlanningEntry; location: string } | null>(null);
  const news = true;
  const agenda = true;

  const view = useMemo(() => {
    const days = data?.days ?? [];
    const today = days[0];
    const tomorrow = data?.scope === "tomorrow" ? days[0] : days[1];
    const decision = resolvePlanningPresentation({
      mode: settings.displayMode,
      todayGroups: data?.scope === "today-and-tomorrow" && today ? groupSizes(today.entries) : [],
      tomorrowGroups: tomorrow ? groupSizes(tomorrow.entries) : [],
      news,
      agenda,
    });
    const shown: ShipPlanningDay[] = [];
    if (decision.presentation === "today-and-tomorrow" && data?.scope === "today-and-tomorrow") {
      if (today) shown.push(today);
      if (tomorrow) shown.push(tomorrow);
    } else if (tomorrow) {
      shown.push(tomorrow);
    }
    return { decision, shown };
  }, [data, settings.displayMode]);

  const status = error && !data ? "unavailable" : (data?.status ?? "unavailable");

  return (
    <article
      className="tv-card flex h-full min-h-0 flex-col overflow-hidden px-4 py-3"
      data-testid="ship-planning"
      data-presentation={view.decision.presentation}
      data-status={status}
    >
      <header className="flex shrink-0 items-baseline justify-between gap-3">
        <h2 className="font-display text-[26px] leading-none font-semibold tracking-[0.06em] uppercase">
          Schepenplanning {view.decision.presentation === "today-and-tomorrow" ? "vandaag en morgen" : "morgen"}
        </h2>
        {status === "stale" ? <p className="text-[14px] text-gold">Laatste geldige planning</p> : null}
        {status === "disabled" ? <p className="text-[14px] text-mist">Uitgeschakeld</p> : null}
      </header>
      {status === "unavailable" || status === "disabled" ? (
        <p className="mt-3 text-[18px] text-mist">
          {status === "disabled" ? "Schepenplanning staat uit." : "Schepenplanning tijdelijk niet beschikbaar."}
        </p>
      ) : view.shown.every((day) => day.entries.length === 0) ? (
        <p className="mt-3 text-[18px] text-mist">Geen ritten voor deze dag.</p>
      ) : (
        <div className="mt-2 min-h-0 flex-1 overflow-hidden">
          <div className={view.shown.length > 1 ? "grid h-full grid-rows-2 gap-3" : "h-full"}>
            {view.shown.map((day) => (
              <PlanningTable
                key={day.date}
                day={day}
                title={view.shown.length > 1 ? dayHeading(day, day.date) : ""}
                rowHeight={view.decision.rowHeight}
                columnsCount={view.decision.columns}
                onOpen={(entry, location) => setSelected({ entry, location })}
              />
            ))}
          </div>
        </div>
      )}
      {selected ? (
        <ShipPlanningDetailDialog
          entry={selected.entry}
          location={selected.location}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </article>
  );
}
