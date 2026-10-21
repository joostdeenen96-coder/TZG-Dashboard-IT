/** Peildatum- en ISO-weekhelpers zonder timezoneverschuiving. */

const amsterdamDateParts = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Amsterdam",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export type CalendarDate = {
  year: number;
  month: number;
  day: number;
};

/** Parse SharePoint peildatum naar Amsterdam-kalenderdatum (YYYY-MM-DD). */
export function peildatumToCalendarIso(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("Peildatum ontbreekt.");
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (ymd) {
    const year = Number(ymd[1]);
    const month = Number(ymd[2]);
    const day = Number(ymd[3]);
    assertValidYmd(year, month, day);
    return formatYmd(year, month, day);
  }
  const stamp = Date.parse(trimmed);
  if (!Number.isFinite(stamp)) throw new Error(`Peildatum ongeldig: ${raw}`);
  const parts = Object.fromEntries(
    amsterdamDateParts.formatToParts(new Date(stamp)).map((part) => [part.type, part.value]),
  );
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  assertValidYmd(year, month, day);
  return formatYmd(year, month, day);
}

export function parseCalendarIso(iso: string): CalendarDate {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) throw new Error(`Ongeldige kalenderdatum: ${iso}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  assertValidYmd(year, month, day);
  return { year, month, day };
}

export function formatYmd(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function assertValidYmd(year: number, month: number, day: number) {
  if (!Number.isInteger(year) || year < 1970 || year > 2100) throw new Error("Peildatumjaar ongeldig.");
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error("Peildatummaand ongeldig.");
  if (!Number.isInteger(day) || day < 1 || day > 31) throw new Error("Peildatumdag ongeldig.");
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() + 1 !== month || utc.getUTCDate() !== day) {
    throw new Error("Peildatum is geen geldige kalenderdag.");
  }
}

/**
 * ISO-8601 weeknummer afgeleid uit kalenderdatum (UTC-noon van Y-M-D).
 * Weeknummer is alleen voor weergave; niet voor recordselectie.
 */
export function isoWeekFromCalendarDate(year: number, month: number, day: number) {
  assertValidYmd(year, month, day);
  const utc = new Date(Date.UTC(year, month - 1, day));
  const weekday = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - weekday);
  const isoYear = utc.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const isoWeek = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return { isoYear, isoWeek };
}

export function isoWeekFromPeildatumIso(peildatumIso: string) {
  const { year, month, day } = parseCalendarIso(peildatumIso);
  return isoWeekFromCalendarDate(year, month, day);
}

export function formatDutchPeildatum(peildatumIso: string) {
  const { year, month, day } = parseCalendarIso(peildatumIso);
  return `${String(day).padStart(2, "0")}-${String(month).padStart(2, "0")}-${year}`;
}
