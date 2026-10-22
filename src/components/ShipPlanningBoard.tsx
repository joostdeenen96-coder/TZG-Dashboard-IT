import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { formatPlanningDate } from "../shipPlanning/amsterdamDate";
import { formatQuantity } from "../shipPlanning/formatQuantity";
import { groupEntries } from "../shipPlanning/groupEntries";
import {
  ROTATION_MS,
  SHIPS_PER_COLUMN,
  buildLocationPages,
  nextRotationIndex,
  type LocationPage,
} from "../shipPlanning/rotation";
import { useShipPlanning } from "../services/shipPlanningService";
import type { ShipPlanningDay, ShipPlanningEntry, ShipPlanningResponse } from "../types/shipPlanning";
import { ShipPlanningDetailDialog } from "./ShipPlanningDetailDialog";

const headings = [
  { label: "Tijd", align: "left" },
  { label: "Klant", align: "left" },
  { label: "Losplaats", align: "left" },
  { label: "Conditie", align: "left" },
  { label: "Product", align: "left" },
  { label: "Hoeveelheid", align: "right" },
  { label: "Schip", align: "left" },
] as const;

const columnTrack =
  "grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.8fr)_minmax(0,1.8fr)_minmax(0,1fr)_minmax(0,2.1fr)_minmax(0,1.1fr)_minmax(0,1.4fr)] items-center";

const singleColumnClass = `${columnTrack} gap-x-2 px-1`;
const splitColumnClass = `${columnTrack} gap-x-1 px-0.5`;

const ROW_HEIGHT = 40;

function cellTitle(value: string | null | undefined) {
  const text = value?.trim();
  return text ? text : undefined;
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

function BoardTitle({
  title,
  dateLabel,
  notices,
  pageLabel,
}: {
  title: string;
  dateLabel: string | null;
  notices: ReactNode;
  pageLabel: string | null;
}) {
  return (
    <header className="grid shrink-0 grid-cols-[minmax(0,1.2fr)_auto_minmax(0,1fr)] items-center gap-3">
      <h2 className="truncate font-display text-[22px] leading-none font-semibold tracking-[0.06em] uppercase">{title}</h2>
      {dateLabel ? <p className="truncate text-[16px] leading-none text-mist">{dateLabel}</p> : <span />}
      <div className="flex min-w-0 items-center justify-end gap-3">
        {notices}
        {pageLabel ? (
          <p className="shrink-0 text-[16px] leading-none text-mist tabular-nums" data-testid="ship-rotation">
            {pageLabel}
          </p>
        ) : null}
      </div>
    </header>
  );
}

function ShipTable({
  entries,
  location,
  label,
  columnClass,
  onOpen,
}: {
  entries: ShipPlanningEntry[];
  location: string;
  label: string;
  columnClass: string;
  onOpen: (entry: ShipPlanningEntry, location: string, label: string) => void;
}) {
  return (
    <div className="min-w-0">
      <div className={`${columnClass} h-5 text-[12px] leading-none font-semibold tracking-[0.08em] text-mist uppercase`}>
        {headings.map((heading) => (
          <span key={heading.label} className={heading.align === "right" ? "text-right" : undefined}>
            {heading.label}
          </span>
        ))}
      </div>
      <ul>
        {entries.map((entry, rowIndex) => {
          const quantity = formatQuantity(entry);
          return (
            <li key={entry.sourceId ?? `${location}-${rowIndex}`}>
              <button
                type="button"
                className={`${columnClass} w-full overflow-hidden text-left text-[20px] leading-none hover:bg-gold/10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-gold ${rowIndex % 2 === 1 ? "bg-white/[0.04]" : ""}`}
                style={{ height: ROW_HEIGHT }}
                onClick={() => onOpen(entry, location, label)}
              >
                <span className="min-w-0 truncate font-display font-semibold tabular-nums" title={cellTitle(entry.time)}>
                  {entry.time ?? "—"}
                </span>
                <span className="min-w-0 truncate" title={cellTitle(entry.customer)}>
                  {entry.customer ?? "—"}
                </span>
                <span className="min-w-0 truncate" title={cellTitle(entry.unloadingLocation)}>
                  {entry.unloadingLocation ?? "—"}
                </span>
                <span className="min-w-0 truncate" title={cellTitle(entry.condition)}>
                  {entry.condition ?? "—"}
                </span>
                <span className="min-w-0 truncate" title={cellTitle(entry.product)}>
                  {entry.product ?? "—"}
                </span>
                <span className="min-w-0 truncate text-right tabular-nums" title={cellTitle(quantity)}>
                  {quantity ?? "—"}
                </span>
                <span className="min-w-0 truncate" title={cellTitle(entry.vessel)}>
                  {entry.vessel ?? "—"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function LocationSlide({
  day,
  resetKey,
  paused,
  embedTitle,
  title,
  dateLabel,
  notices,
  onOpen,
  onProgress,
}: {
  day: ShipPlanningDay;
  resetKey: string;
  paused: boolean;
  embedTitle: boolean;
  title: string;
  dateLabel: string | null;
  notices: ReactNode;
  onOpen: (entry: ShipPlanningEntry, location: string, label: string) => void;
  onProgress: (state: { key: string; active: boolean }) => void;
}) {
  const groups = useMemo(() => groupEntries(day.entries), [day.entries]);
  const pages = useMemo(() => buildLocationPages(groups, SHIPS_PER_COLUMN), [groups]);
  const rotation = useRotation(pages, resetKey, paused);
  const page = rotation.page;
  const pageLabel = rotation.count > 1 ? `${rotation.index + 1} / ${rotation.count}` : null;
  const progressKey = page ? `${resetKey}:${page.location}:${page.pageInLocation}` : resetKey;

  useEffect(() => {
    onProgress({ key: progressKey, active: rotation.count > 1 && page != null });
  }, [onProgress, page, progressKey, rotation.count]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {embedTitle ? <BoardTitle title={title} dateLabel={dateLabel} notices={notices} pageLabel={pageLabel} /> : null}
      {!page ? (
        <p className="mt-2 text-[18px] text-mist">Geen schepen gepland voor deze dag.</p>
      ) : (
        <>
          {!embedTitle && dateLabel ? <p className="text-[16px] leading-none text-mist">{dateLabel}</p> : null}
          <div className="mt-1 flex shrink-0 items-baseline justify-between gap-3">
            <h3
              className="truncate font-display text-[20px] leading-none font-semibold tracking-[0.04em] uppercase"
              data-location={page.location}
              data-location-label={page.label}
            >
              {page.label}
              {page.locationPageCount > 1 ? (
                <span className="ml-3 text-[16px] font-medium tracking-normal text-mist">
                  {page.pageInLocation + 1}/{page.locationPageCount}
                </span>
              ) : null}
            </h3>
            <p className="shrink-0 text-[16px] leading-none text-mist" data-ship-count={page.locationCount}>
              {page.locationCount === 1 ? "1 schip" : `${page.locationCount} schepen`}
            </p>
          </div>
          <div
            className="relative mt-2 min-h-0 flex-1 overflow-hidden"
            data-ships-per-column={SHIPS_PER_COLUMN}
            data-columns={page.columns}
            data-layout={page.columns === 1 ? "single" : "split"}
          >
            {page.columns === 1 ? (
              <ShipTable
                entries={page.left}
                location={page.location}
                label={page.label}
                columnClass={singleColumnClass}
                onOpen={onOpen}
              />
            ) : (
              <div className="grid grid-cols-2 gap-x-6">
                <ShipTable
                  entries={page.left}
                  location={page.location}
                  label={page.label}
                  columnClass={splitColumnClass}
                  onOpen={onOpen}
                />
                <ShipTable
                  entries={page.right}
                  location={page.location}
                  label={page.label}
                  columnClass={splitColumnClass}
                  onOpen={onOpen}
                />
              </div>
            )}
          </div>
        </>
      )}
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
  const title = data ? planningTitle(data, bothEmpty) : "Schepenplanning";
  const dateLabel = shownDays.length === 1 && shownDays[0] && !bothEmpty ? formatPlanningDate(shownDays[0].date) : null;
  const [progress, setProgress] = useState<{ key: string; active: boolean } | null>(null);
  const onProgress = useCallback((next: { key: string; active: boolean }) => {
    setProgress((current) => (current?.key === next.key && current.active === next.active ? current : next));
  }, []);
  const notices = (
    <>
      {status === "stale" ? <p className="truncate text-[14px] leading-none text-gold">Gegevens tijdelijk niet vernieuwd</p> : null}
      {finished ? <p className="truncate text-[14px] leading-none text-mist">Planning vandaag afgerond</p> : null}
      {status === "disabled" ? <p className="truncate text-[14px] leading-none text-mist">Uitgeschakeld</p> : null}
    </>
  );

  return (
    <article
      className="tv-card flex h-full min-h-0 flex-col overflow-hidden px-4 py-2"
      data-testid="ship-planning"
      data-displayed-day={data?.displayedDay ?? ""}
      data-switch-reason={data?.switchReason ?? ""}
      data-status={status}
      data-presentation={data?.scope === "today-and-tomorrow" ? "today-and-tomorrow" : (data?.displayedDay ?? "")}
    >
      {status === "unavailable" || status === "disabled" ? (
        <>
          <BoardTitle title={title} dateLabel={null} notices={notices} pageLabel={null} />
          <p className="mt-2 text-[18px] text-mist">
            {status === "disabled" ? "Schepenplanning staat uit." : "Schepenplanning tijdelijk niet beschikbaar."}
          </p>
        </>
      ) : bothEmpty ? (
        <>
          <BoardTitle title={title} dateLabel={null} notices={notices} pageLabel={null} />
          <p className="mt-2 text-[18px] text-mist">Geen schepen gepland voor vandaag of morgen.</p>
        </>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {shownDays.length > 1 ? <BoardTitle title={title} dateLabel={null} notices={notices} pageLabel={null} /> : null}
          {data?.scope === "today-and-tomorrow" ? (
            <p className="mt-1 shrink-0 text-[14px] text-mist">Beide dagen zijn bij veel ritten minder leesbaar op het scherm.</p>
          ) : null}
          <div className={`flex min-h-0 flex-1 flex-col overflow-hidden ${shownDays.length > 1 ? "gap-2" : ""}`}>
            {shownDays.map((day, dayIndex) => (
              <LocationSlide
                key={`${day.date}-${data?.displayedDay ?? ""}`}
                day={day}
                resetKey={`${data?.displayedDay ?? ""}:${day.date}`}
                paused={selected != null}
                embedTitle={shownDays.length === 1}
                title={title}
                dateLabel={shownDays.length === 1 ? dateLabel : formatPlanningDate(day.date)}
                notices={shownDays.length === 1 ? notices : null}
                onOpen={(entry, location, label) =>
                  setSelected({
                    entry,
                    location,
                    label,
                    planningDate: formatPlanningDate(day.date),
                    dayLabel:
                      data?.displayedDay === "tomorrow" && data.scope !== "today-and-tomorrow"
                        ? "Morgen"
                        : dayIndex === 1
                          ? "Morgen"
                          : "Vandaag",
                  })
                }
                onProgress={onProgress}
              />
            ))}
          </div>
        </div>
      )}
      {progress?.active ? (
        <div className="pointer-events-none absolute inset-x-4 bottom-1.5 z-10 h-[3px] overflow-hidden rounded-full bg-white/10" data-testid="ship-rotation-track">
          <div
            key={progress.key}
            data-testid="ship-rotation-progress"
            data-paused={selected != null ? "true" : "false"}
            className="ship-rotation-progress h-full rounded-full bg-gold"
            style={{ animationDuration: `${ROTATION_MS}ms` }}
          />
        </div>
      ) : null}
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
