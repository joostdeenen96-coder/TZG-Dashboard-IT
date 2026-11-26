/** Zelfde regel als de server: vanaf de 15e in Europe/Amsterdam is de volgende maand zichtbaar. */
export function isNextGasOilMonthOpen(now = new Date()) {
  const day = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Amsterdam", day: "2-digit" }).format(now),
  );
  return day >= 15;
}

export function gasOilMonthLabel(applicableMonth: string | null) {
  if (!applicableMonth) return "";
  const match = /^(\d{4})-(\d{2})$/.exec(applicableMonth);
  if (!match) return applicableMonth;
  const stamp = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1, 12));
  return new Intl.DateTimeFormat("nl-NL", {
    timeZone: "Europe/Amsterdam",
    month: "long",
    year: "numeric",
  }).format(stamp);
}
