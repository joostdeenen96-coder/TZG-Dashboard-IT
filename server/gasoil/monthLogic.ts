/** Amsterdam calendar helpers for the 15th → next-month gasoil rule. */

function amsterdamParts(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Amsterdam",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
  };
}

export function formatYearMonth(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function formatIsoDate(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Applicable surcharge month for "now" (calendar month in Amsterdam). Used by BE. */
export function currentApplicableMonth(now = new Date()) {
  const { year, month } = amsterdamParts(now);
  return formatYearMonth(year, month);
}

/**
 * NL: peildatum 15e → toeslag voor de daaropvolgende maand.
 * Vanaf de 15e (Amsterdam) is die volgende maand de getoonde toepassingsmaand.
 * 10 okt → oktober (peildatum 15 sep); 15/22 okt → november (peildatum 15 okt).
 */
export function currentApplicableMonthNetherlands(now = new Date()) {
  const { year, month, day } = amsterdamParts(now);
  if (day >= 15) {
    if (month === 12) return formatYearMonth(year + 1, 1);
    return formatYearMonth(year, month + 1);
  }
  return formatYearMonth(year, month);
}

export function amsterdamCalendarDate(now = new Date()) {
  const { year, month, day } = amsterdamParts(now);
  return formatIsoDate(year, month, day);
}

/**
 * Peiling for an applicable month: 15th of the previous calendar month.
 * November 2026 → 2026-10-15
 * October 2026 → 2026-09-15
 * January 2027 → 2026-12-15
 */
export function referenceDateForApplicableMonth(applicableMonth: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(applicableMonth);
  if (!match) throw new Error(`Ongeldige toepassingsmaand: ${applicableMonth}`);
  let year = Number(match[1]);
  let month = Number(match[2]) - 1;
  if (month < 1) {
    month = 12;
    year -= 1;
  }
  return formatIsoDate(year, month, 15);
}

/** Spec-alias: getReferenceDate(applicableMonth) */
export const getReferenceDate = referenceDateForApplicableMonth;

/** Volgende of vorige toepassingsmaand, zonder kalenderdag. December + 1 = januari volgend jaar. */
export function addApplicableMonths(applicableMonth: string, delta = 1) {
  const match = /^(\d{4})-(\d{2})$/.exec(applicableMonth);
  if (!match) throw new Error(`Ongeldige toepassingsmaand: ${applicableMonth}`);
  const cursor = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1 + delta, 1));
  return formatYearMonth(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1);
}

export function applicableMonthFromReferenceDate(referenceDate: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(referenceDate);
  if (!match) throw new Error(`Ongeldige peildatum: ${referenceDate}`);
  let year = Number(match[1]);
  let month = Number(match[2]) + 1;
  if (month > 12) {
    month = 1;
    year += 1;
  }
  return formatYearMonth(year, month);
}

export function dutchMonthName(applicableMonth: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(applicableMonth);
  if (!match) return applicableMonth;
  const month = Number(match[2]);
  const names = [
    "januari",
    "februari",
    "maart",
    "april",
    "mei",
    "juni",
    "juli",
    "augustus",
    "september",
    "oktober",
    "november",
    "december",
  ];
  return names[month - 1] ?? applicableMonth;
}
