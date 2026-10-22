/** Kalendergrenzen in Europe/Amsterdam. Geen eigen interpretatie van laad- versus losdatum. */

const YMD = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Amsterdam",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function amsterdamYmd(now: Date = new Date(), offsetDays = 0) {
  const parts = YMD.formatToParts(now);
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const year = Number(read("year"));
  const month = Number(read("month"));
  const day = Number(read("day"));
  const utc = new Date(Date.UTC(year, month - 1, day + offsetDays));
  const y = utc.getUTCFullYear();
  const m = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const d = String(utc.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function amsterdamOffsetMs(instant: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  const hour = read("hour");
  const asUtc = Date.UTC(
    read("year"),
    read("month") - 1,
    read("day"),
    hour === 24 ? 0 : hour,
    read("minute"),
    read("second"),
  );
  return asUtc - instant.getTime();
}

/** Wall-clock in Amsterdam → UTC epoch ms. Zelfde idee als getUnixTime(local)*1000. */
export function amsterdamWallToUtcMs(year: number, month: number, day: number, hour: number, minute: number, second: number) {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second);
  const offset = amsterdamOffsetMs(new Date(guess));
  let utc = guess - offset;
  const offsetAtUtc = amsterdamOffsetMs(new Date(utc));
  if (offsetAtUtc !== offset) utc = guess - offsetAtUtc;
  return utc;
}

export type AmsterdamDayBounds = {
  date: string;
  startMs: number;
  endMs: number;
};

/** Inclusief 00:00:00.000 t/m 23:59:59.000, passend bij GEQ/LEQ op epoch-ms. */
export function amsterdamDayBounds(ymd: string): AmsterdamDayBounds {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) throw new Error("Ongeldige datum.");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return {
    date: ymd,
    startMs: amsterdamWallToUtcMs(year, month, day, 0, 0, 0),
    endMs: amsterdamWallToUtcMs(year, month, day, 23, 59, 59),
  };
}

export function formatAmsterdamTime(epochMs: number) {
  return new Intl.DateTimeFormat("nl-NL", {
    timeZone: "Europe/Amsterdam",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(epochMs));
}

export function formatAmsterdamDate(epochMs: number) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(epochMs));
}
