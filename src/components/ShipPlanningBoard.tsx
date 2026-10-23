import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatPlanningDate, planningTodayMark, shipPlanningTitle } from "../shipPlanning/amsterdamDate";
import { formatQuantity } from "../shipPlanning/formatQuantity";
import { groupEntries } from "../shipPlanning/groupEntries";
import {
  SHIPS_PER_COLUMN,
  buildLocationPages,
  entriesForDisplayedLoadDay,
  nextRotationIndex,
  stepLocationIndex,
  type LocationPage,
} from "../shipPlanning/rotation";
import { useShipPlanning } from "../services/shipPlanningService";
import type { ShipPlanningDay, ShipPlanningEntry } from "../types/shipPlanning";
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

const singleColumnClass = `${columnTrack} gap-x-[clamp(6px,0.4vw,12px)] px-1`;
const splitColumnClass = `${columnTrack} gap-x-[clamp(4px,0.28vw,8px)] px-0.5`;

const ROW_HEIGHT = 40;

function cellTitle(value: string | null | undefined) {
  const text = value?.trim();
  return text ? text : undefined;
}

function useLocationNavigation(pages: LocationPage[], resetKey: string) {
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

  const count = pages.length;
  const safeIndex = count === 0 ? 0 : Math.min(index, count - 1);
  const step = (delta: number) => {
    if (count < 2) return;
    setIndex((current) => stepLocationIndex(current, count, delta));
  };
  return { page: pages[safeIndex] ?? null, index: safeIndex, count, step };
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
    <header className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
      <h2
        className="min-w-0 font-display leading-none font-semibold"
        style={{ fontSize: "var(--ship-title, 22px)" }}
        data-ship-title=""
      >
        <span className="whitespace-nowrap">{title}</span>
        {dateLabel ? (
          <span className="ml-3 font-medium text-mist" style={{ fontSize: "var(--ship-meta, 16px)" }} data-ship-today="">
            {dateLabel}
          </span>
        ) : null}
      </h2>
      <div className="flex min-w-0 items-center justify-end gap-3">
        {notices}
        {pageLabel ? (
          <p className="shrink-0 leading-none text-mist tabular-nums" style={{ fontSize: "var(--ship-meta, 16px)" }} data-testid="ship-rotation">
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
  onOpen: (entry: ShipPlanningEntry, location: string, label: string, trigger: HTMLElement) => void;
}) {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div
        className={`${columnClass} leading-none font-medium tracking-[0.06em] text-mist uppercase`}
        data-ship-head=""
        style={{ height: "var(--ship-head, 20px)", fontSize: "var(--ship-head-text, 12px)" }}
      >
        {headings.map((heading) => (
          <span key={heading.label} className={heading.align === "right" ? "text-right" : undefined}>
            {heading.label}
          </span>
        ))}
      </div>
      <ul className="flex min-h-0 flex-1 flex-col justify-start">
        {Array.from({ length: SHIPS_PER_COLUMN }, (_, rowIndex) => {
          const entry = entries[rowIndex];
          const quantity = entry ? formatQuantity(entry) : null;
          return (
            <li
              key={entry?.sourceId ?? `${location}-slot-${rowIndex}`}
              className="min-h-0"
              style={{
                flex: "1 1 0",
                minHeight: "var(--ship-row, " + ROW_HEIGHT + "px)",
                maxHeight: "var(--ship-row-max, 96px)",
              }}
            >
              {entry ? (
              <button
                type="button"
                className={`${columnClass} h-full w-full overflow-hidden text-left leading-none hover:bg-gold/10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-gold ${rowIndex % 2 === 1 ? "bg-white/[0.04]" : ""}`}
                style={{ fontSize: "var(--ship-text, 20px)" }}
                onClick={(event) => onOpen(entry, location, label, event.currentTarget)}
              >
                <span className="min-w-0 truncate font-display font-semibold tabular-nums" title={cellTitle(entry.time)}>
                  {entry.time ?? "–"}
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
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function NavButton({
  direction,
  disabled,
  onStep,
}: {
  direction: "prev" | "next";
  disabled: boolean;
  onStep: (delta: number) => void;
}) {
  const previous = direction === "prev";
  return (
    <button
      type="button"
      className="ship-nav-button"
      data-testid={previous ? "ship-nav-prev" : "ship-nav-next"}
      aria-label={previous ? "Vorige laadplaats" : "Volgende laadplaats"}
      disabled={disabled}
      onClick={() => onStep(previous ? -1 : 1)}
    >
      {previous ? <ChevronLeft className="h-5 w-5" strokeWidth={2.2} /> : <ChevronRight className="h-5 w-5" strokeWidth={2.2} />}
    </button>
  );
}

function LocationSlide({
  day,
  resetKey,
  embedTitle,
  title,
  dateLabel,
  notices,
  onOpen,
}: {
  day: ShipPlanningDay;
  resetKey: string;
  embedTitle: boolean;
  title: string;
  dateLabel: string | null;
  notices: ReactNode;
  onOpen: (entry: ShipPlanningEntry, location: string, label: string, trigger: HTMLElement) => void;
}) {
  const visibleEntries = useMemo(
    () => entriesForDisplayedLoadDay(day.entries, day.date),
    [day.date, day.entries],
  );
  const groups = useMemo(() => groupEntries(visibleEntries), [visibleEntries]);
  const pages = useMemo(() => buildLocationPages(groups, SHIPS_PER_COLUMN), [groups]);
  const navigation = useLocationNavigation(pages, resetKey);
  const page = navigation.page;
  const pageLabel = navigation.count > 1 ? `${navigation.index + 1} / ${navigation.count}` : null;
  const navDisabled = navigation.count < 2;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {embedTitle ? <BoardTitle title={title} dateLabel={dateLabel} notices={notices} pageLabel={pageLabel} /> : null}
      {!page ? (
        <p className="mt-2 text-[18px] text-mist">Geen schepen gepland voor deze dag.</p>
      ) : (
        <>
          {!embedTitle && dateLabel ? <p className="text-[16px] leading-none text-mist">{dateLabel}</p> : null}
          <div className="mt-1 flex shrink-0 items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <NavButton direction="prev" disabled={navDisabled} onStep={navigation.step} />
              <h3
                className="truncate font-display leading-none font-semibold tracking-[0.04em] uppercase"
                style={{ fontSize: "var(--ship-title, 20px)" }}
                data-location={page.location}
                data-location-label={page.label}
              >
                {page.label}
                {page.locationPageCount > 1 ? (
                  <span className="ml-3 font-medium tracking-normal text-mist" style={{ fontSize: "var(--ship-meta, 16px)" }}>
                    {page.pageInLocation + 1}/{page.locationPageCount}
                  </span>
                ) : null}
              </h3>
              <NavButton direction="next" disabled={navDisabled} onStep={navigation.step} />
            </div>
            <p className="shrink-0 leading-none text-mist" style={{ fontSize: "var(--ship-meta, 16px)" }} data-ship-count={page.locationCount}>
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
              <div className="grid h-full grid-cols-2 gap-x-[clamp(12px,1vw,28px)]">
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
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const notices = (
    <>
      {status === "stale" ? <p className="truncate text-[14px] leading-none text-gold">Gegevens tijdelijk niet vernieuwd</p> : null}
      {finished ? <p className="truncate text-[14px] leading-none text-mist">Planning vandaag afgerond</p> : null}
      {status === "disabled" ? <p className="truncate text-[14px] leading-none text-mist">Uitgeschakeld</p> : null}
    </>
  );

  return (
    <article
      className="tv-card flex h-full min-h-0 flex-col overflow-hidden px-[clamp(12px,0.9vw,22px)] py-[clamp(6px,0.55vh,12px)]"
      data-testid="ship-planning"
      data-displayed-day={data?.displayedDay ?? ""}
      data-switch-reason={data?.switchReason ?? ""}
      data-status={status}
      data-presentation={data?.scope === "today-and-tomorrow" ? "today-and-tomorrow" : (data?.displayedDay ?? "")}
    >
      {status === "unavailable" || status === "disabled" ? (
        <>
          <BoardTitle title="Schepenplanning" dateLabel={null} notices={notices} pageLabel={null} />
          <p className="mt-2 text-[18px] text-mist">
            {status === "disabled" ? "Schepenplanning staat uit." : "Schepenplanning tijdelijk niet beschikbaar."}
          </p>
        </>
      ) : bothEmpty ? (
        <>
          <BoardTitle title="Schepenplanning" dateLabel={null} notices={notices} pageLabel={null} />
          <p className="mt-2 text-[18px] text-mist">Geen schepen gepland voor vandaag of morgen.</p>
        </>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {data?.scope === "today-and-tomorrow" ? (
            <p className="mt-1 shrink-0 text-[14px] text-mist">Beide dagen zijn bij veel ritten minder leesbaar op het scherm.</p>
          ) : null}
          <div className={`flex min-h-0 flex-1 flex-col overflow-hidden ${shownDays.length > 1 ? "gap-2" : ""}`}>
            {shownDays.map((day, dayIndex) => (
              <LocationSlide
                key={`${day.date}-${data?.displayedDay ?? ""}`}
                day={day}
                resetKey={`${data?.displayedDay ?? ""}:${day.date}`}
                embedTitle
                title={shipPlanningTitle(day.date)}
                dateLabel={planningTodayMark(day.date)}
                notices={dayIndex === 0 ? notices : null}
                onOpen={(entry, location, label, trigger) => {
                  returnFocusRef.current = trigger;
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
                  });
                }}
              />
            ))}
          </div>
        </div>
      )}
      {selected ? (
        <ShipPlanningDetailDialog
          entry={selected.entry}
          location={selected.label}
          planningDate={`${selected.dayLabel} · ${selected.planningDate}`}
          returnFocus={returnFocusRef.current}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </article>
  );
}
