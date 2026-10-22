import { usePlanningFluid } from "../display/planningFluid";
import { useWijAgenda } from "../services/agendaService";
import type { WijAgendaItem } from "../types";

const MONTHS = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

function utcKey(iso: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
}

function shiftUtcKey(key: string, days: number) {
  const [year, month, day] = key.split("-").map(Number);
  if (!year || !month || !day) return key;
  const date = new Date(Date.UTC(year, month - 1, day + days));
  const nextMonth = String(date.getUTCMonth() + 1).padStart(2, "0");
  const nextDay = String(date.getUTCDate()).padStart(2, "0");
  return `${date.getUTCFullYear()}-${nextMonth}-${nextDay}`;
}

function amsterdamKey(iso: string) {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(time));
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${read("year")}-${read("month")}-${read("day")}`;
}

function amsterdamClock(iso: string) {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return "";
  return new Intl.DateTimeFormat("nl-NL", {
    timeZone: "Europe/Amsterdam",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(time));
}

function endKey(item: WijAgendaItem) {
  if (!item.allDay) return amsterdamKey(item.endsAt);
  const end = utcKey(item.endsAt);
  const start = utcKey(item.startsAt);
  if (end && start && end > start && /T00:00:00(?:\.0+)?Z$/i.test(item.endsAt)) return shiftUtcKey(end, -1);
  return end || start;
}

function monthLabel(key: string) {
  const month = Number(key.slice(5, 7));
  return MONTHS[month - 1] ?? "";
}

function dayLabel(start: string, end: string) {
  const startDay = String(Number(start.slice(8, 10)));
  if (!end || end === start) return startDay;
  if (start.slice(0, 7) === end.slice(0, 7)) return `${startDay}–${Number(end.slice(8, 10))}`;
  return startDay;
}

function chipFace(item: WijAgendaItem) {
  const start = item.allDay ? utcKey(item.startsAt) : amsterdamKey(item.startsAt);
  const end = endKey(item);
  const day = dayLabel(start, end);
  const month = monthLabel(start);
  const spansMonths = Boolean(end && start && end.slice(0, 7) !== start.slice(0, 7));
  const until = spansMonths ? `t/m ${Number(end.slice(8, 10))} ${monthLabel(end)}` : "";
  if (item.allDay) {
    const extra = item.location || until || "Hele dag";
    return { day, month, detail: extra, time: "", extra };
  }
  const from = amsterdamClock(item.startsAt);
  const to = amsterdamClock(item.endsAt);
  const clock = from && to && from !== to ? `${from}–${to}` : from;
  const detail = [until || clock, item.location].filter(Boolean).join(" · ");
  return { day, month, detail, time: until || clock, extra: item.location || "" };
}

export function AgendaBar() {
  const state = useWijAgenda();
  const fluid = usePlanningFluid();

  if (state.status === "loading") {
    return (
      <div className="tv-card flex h-full items-center px-6" data-agenda-root="" data-status="loading">
        <p className="text-[18px] text-mist">Agenda laden.</p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="tv-card flex h-full items-center gap-4 px-6" data-agenda-root="" data-status="error">
        <p className="text-[13px] font-semibold tracking-[0.08em] text-gold uppercase" data-agenda-heading="">Agenda</p>
        <p className="truncate text-[18px] text-mist">{state.message}</p>
      </div>
    );
  }

  if (state.status === "empty") {
    return (
      <div className="tv-card flex h-full items-center gap-4 px-6" data-agenda-root="" data-status="empty">
        <p className="font-display text-[28px] leading-none font-semibold tracking-[-0.015em]" data-agenda-heading="">Agenda</p>
        <p className="text-[18px] text-mist">Geen komende afspraken.</p>
      </div>
    );
  }

  const agenda = state.data;
  if (!agenda.connected) {
    return (
      <div className="tv-card flex h-full items-center gap-4 px-6" data-agenda-root="" data-status={state.status}>
        <p className="text-[13px] font-semibold tracking-[0.08em] text-gold uppercase" data-agenda-heading="">Agenda</p>
        <p className="truncate text-[18px] text-mist">{agenda.error || "WijTeunesen-agenda niet bereikbaar."}</p>
      </div>
    );
  }

  if (agenda.items.length === 0) {
    return (
      <div className="tv-card flex h-full items-center gap-4 px-6" data-agenda-root="" data-status="empty">
        <p className="font-display text-[28px] leading-none font-semibold tracking-[-0.015em]" data-agenda-heading="">Agenda</p>
        <p className="text-[18px] text-mist">Geen komende afspraken.</p>
      </div>
    );
  }

  return (
    <section className="tv-card flex h-full min-h-0 items-center gap-5 overflow-hidden px-6" data-agenda-root="" data-status={state.status} aria-label="Agenda">
      <div className="w-[120px] shrink-0" data-agenda-brand="">
        <p className="font-display text-[32px] leading-none font-semibold tracking-[-0.015em]" data-agenda-heading="">Agenda</p>
      </div>
      <div className="flex min-w-0 flex-1 items-stretch gap-3 overflow-hidden">
        {agenda.items.map((item) => {
          const face = chipFace(item);
          return (
            <article key={item.id} className="flex min-w-0 flex-1 items-center gap-3 rounded-[20px] border border-veil/12 bg-veil/[0.06] px-3.5 py-2.5" data-agenda-card="">
              <div className="w-[88px] shrink-0 border-r border-gold/35 pr-3 text-center" data-agenda-date="">
                <p
                  className={`font-display leading-none font-semibold whitespace-nowrap text-gold tabular-nums ${face.day.includes("–") ? "text-[24px]" : "text-[30px]"}`}
                  data-agenda-day=""
                >
                  {face.day}
                </p>
                <p className="mt-1 text-[12px] tracking-[0.16em] text-mist uppercase" data-agenda-month="">{face.month}</p>
              </div>
              <div className="min-w-0">
                {fluid ? (
                  <p className="truncate font-semibold" data-agenda-title="">
                    {item.title}
                    {face.time ? (
                      <span className="font-medium text-mist" data-agenda-time="">
                        {" "}
                        · {face.time}
                      </span>
                    ) : null}
                  </p>
                ) : (
                  <p className="line-clamp-2 text-[18px] leading-snug font-semibold">{item.title}</p>
                )}
                {fluid ? (
                  face.extra ? (
                    <p className="truncate text-mist" data-agenda-extra={face.extra === "Hele dag" ? "all-day" : "note"}>
                      {face.extra}
                    </p>
                  ) : null
                ) : (
                  <p className="mt-0.5 truncate text-[14px] text-mist">{face.detail}</p>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
