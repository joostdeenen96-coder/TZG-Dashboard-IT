import { useEffect, useMemo, useRef, useState } from "react";
import { formatPlanningDate } from "../shipPlanning/amsterdamDate";
import { formatQuantity } from "../shipPlanning/formatQuantity";
import { groupEntries } from "../shipPlanning/groupEntries";
import {
  ROTATION_MS,
  buildLocationPages,
  nextRotationIndex,
  rowsPerPage,
  type LocationPage,
} from "../shipPlanning/rotation";
import { useShipPlanning } from "../services/shipPlanningService";
import type { ShipPlanningDay, ShipPlanningEntry, ShipPlanningResponse } from "../types/shipPlanning";
import { ShipPlanningDetailDialog } from "./ShipPlanningDetailDialog";

const columns = ["Tijd", "Klant", "Losplaats", "Conditie", "Product", "Hoeveelheid", "Schip"] as const;

const columnClass =
  "grid grid-cols-[88px_minmax(0,1.4fr)_minmax(0,1.3fr)_minmax(0,0.9fr)_minmax(0,1.2fr)_110px_minmax(0,1fr)] items-center gap-3 px-2";

const ROW_HEIGHT = 44;

function ColumnHead() {
  return (
    <div className={`${columnClass} h-5 text-[14px] leading-none font-semibold tracking-[0.08em] text-mist uppercase`}>
      {columns.map((label) => (
        <span key={label}>{label}</span>
      ))}
    </div>
  );
}

function useRotation(pages: LocationPage[], resetKey: string, paused: boolean) {
  const [index, setIndex] = useState(0);
  const previous = useRef(pages);
  const keyRef = useRef(resetKey);

  useEffect(() => {
    if (keyRef.current !== resetKey) {
      keyRef.current = resetKey;
      previous.current = pages;
      setIndex(0);
      return;
    }
    setIndex((current) => nextRotationIndex(current, previous.current, pages));
    previous.current = pages;
  }, [pages, resetKey]);

  useEffect(() => {
    if (paused || pages.length < 2) return;
    const id = window.setInterval(() => {
      setIndex((current) => (current + 1) % pages.length);
    }, ROTATION_MS);
    return () => window.clearInterval(id);
  }, [paused, pages.length, resetKey]);

  const safeIndex = pages.length === 0 ? 0 : Math.min(index, pages.length - 1);
  return { page: pages[safeIndex] ?? null, index: safeIndex, count: pages.length };
}

function LocationSlide({
  day,
  resetKey,
  paused,
  onOpen,
}: {
  day: ShipPlanningDay;
  resetKey: string;
  paused: boolean;
  onOpen: (entry: ShipPlanningEntry, location: string, label: string) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [pageSize, setPageSize] = useState(8);
  const groups = useMemo(() => groupEntries(day.entries), [day.entries]);
  const pages = useMemo(() => buildLocationPages(groups, pageSize), [groups, pageSize]);
  const rotation = useRotation(pages, resetKey, paused);

  useEffect(() => {
    const element = listRef.current;
    if (!element) return;
    const measure = () => setPageSize(rowsPerPage(element.clientHeight - 20, ROW_HEIGHT));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const page = rotation.page;
  if (!page) return <p className="mt-3 text-[18px] text-mist">Geen schepen gepland voor deze dag.</p>;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="mt-2 flex items-baseline justify-between gap-3">
        <h3
          className="truncate font-display text-[32px] leading-none font-semibold tracking-[0.06em] text-paper uppercase"
          data-location={page.location}
          data-location-label={page.label}
        >
          {page.label}
        </h3>
        {rotation.count > 1 ? (
          <p className="shrink-0 text-[14px] text-mist">
            {rotation.index + 1}/{rotation.count}
          </p>
        ) : null}
      </div>
      <div ref={listRef} className="mt-2 min-h-0 flex-1 overflow-hidden" data-rows-per-page={pageSize}>
        <ColumnHead />
        <ul>
          {page.entries.map((entry, rowIndex) => (
            <li key={entry.sourceId ?? `${page.location}-${rowIndex}`}>
              <button
                type="button"
                className={`${columnClass} w-full text-left leading-none hover:bg-gold/10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-gold`}
                style={{ height: ROW_HEIGHT }}
                onClick={() => onOpen(entry, page.location, page.label)}
              >
                <span className="truncate font-display text-[22px] font-semibold tabular-nums">{entry.time ?? "—"}</span>
                <span className="truncate text-[20px]">{entry.customer ?? "—"}</span>
                <span className="truncate text-[20px]">{entry.unloadingLocation ?? "—"}</span>
                <span className="truncate text-[20px]">{entry.condition ?? "—"}</span>
                <span className="truncate text-[20px]">{entry.product ?? "—"}</span>
                <span className="truncate text-[20px] tabular-nums">{formatQuantity(entry) ?? "—"}</span>
                <span className="truncate text-[20px]">{entry.vessel ?? "—"}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function planningTitle(data: ShipPlanningResponse, bothEmpty: boolean) {
  if (bothEmpty) return "Schepenplanning";
  if (data.scope === "today-and-tomorrow") return "Schepenplanning vandaag en morgen";
  return data.displayedDay === "tomorrow" ? "Schepenplanning morgen" : "Schepenplanning vandaag";
}

export function ShipPlanningBoard() {
  const { data, error } = useShipPlanning();
  const [selected, setSelected] = useState<{
    entry: ShipPlanningEntry;
    location: string;
    label: string;
    planningDate: string;
    dayLabel: string;
  } | null>(null);

  const status = error && !data ? "unavailable" : (data?.status ?? "unavailable");
  const bothEmpty = Boolean(
    data &&
      data.todayEmptyConfirmed &&
      data.todayRecordCount === 0 &&
      data.tomorrowRecordCount === 0 &&
      data.switchReason === "today-empty-confirmed",
  );
  const shownDays = data?.scope === "today-and-tomorrow" ? data.days : data?.days.slice(0, 1) ?? [];
  const finished = data?.switchReason === "today-empty-confirmed" && data.displayedDay === "tomorrow";

  return (
    <article
      className="tv-card flex h-full min-h-0 flex-col overflow-hidden px-4 py-3"
      data-testid="ship-planning"
      data-displayed-day={data?.displayedDay ?? ""}
      data-switch-reason={data?.switchReason ?? ""}
      data-status={status}
      data-presentation={data?.scope === "today-and-tomorrow" ? "today-and-tomorrow" : (data?.displayedDay ?? "")}
    >
      <header className="flex shrink-0 items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-[26px] leading-none font-semibold tracking-[0.06em] uppercase">
            {data ? planningTitle(data, bothEmpty) : "Schepenplanning"}
          </h2>
          {shownDays.length === 1 && shownDays[0] && !bothEmpty ? (
            <p className="mt-1 text-[18px] text-mist">{formatPlanningDate(shownDays[0].date)}</p>
          ) : null}
        </div>
        <div className="shrink-0 text-right">
          {status === "stale" ? <p className="text-[14px] text-gold">Gegevens tijdelijk niet vernieuwd</p> : null}
          {finished ? <p className="text-[14px] text-mist">Planning vandaag afgerond</p> : null}
          {status === "disabled" ? <p className="text-[14px] text-mist">Uitgeschakeld</p> : null}
        </div>
      </header>
      {data?.scope === "today-and-tomorrow" ? (
        <p className="mt-1 text-[14px] text-mist">Beide dagen zijn bij veel ritten minder leesbaar op het scherm.</p>
      ) : null}
      {status === "unavailable" || status === "disabled" ? (
        <p className="mt-3 text-[18px] text-mist">
          {status === "disabled" ? "Schepenplanning staat uit." : "Schepenplanning tijdelijk niet beschikbaar."}
        </p>
      ) : bothEmpty ? (
        <p className="mt-3 text-[18px] text-mist">Geen schepen gepland voor vandaag of morgen.</p>
      ) : (
        <div className={`mt-1 flex min-h-0 flex-1 flex-col overflow-hidden ${shownDays.length > 1 ? "gap-3" : ""}`}>
          {shownDays.map((day) => (
            <LocationSlide
              key={`${day.date}-${data?.displayedDay ?? ""}`}
              day={day}
              resetKey={`${data?.displayedDay ?? ""}:${day.date}`}
              paused={selected != null}
              onOpen={(entry, location, label) =>
                setSelected({
                  entry,
                  location,
                  label,
                  planningDate: formatPlanningDate(day.date),
                  dayLabel: data?.displayedDay === "tomorrow" && data.scope !== "today-and-tomorrow" ? "Morgen" : day === shownDays[1] ? "Morgen" : "Vandaag",
                })
              }
            />
          ))}
        </div>
      )}
      {selected ? (
        <ShipPlanningDetailDialog
          entry={selected.entry}
          location={selected.label}
          planningDate={`${selected.dayLabel} · ${selected.planningDate}`}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </article>
  );
}
