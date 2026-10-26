const YMD = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Amsterdam",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function amsterdamToday(now = new Date()) {
  return YMD.format(now);
}

function shiftYmd(ymd: string, days: number) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) return ymd;
  const utc = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  const year = utc.getUTCFullYear();
  const month = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const day = String(utc.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function amsterdamTomorrow(now = new Date()) {
  return shiftYmd(amsterdamToday(now), 1);
}

export function amsterdamYmdFromEpoch(epochMs: number) {
  return YMD.format(new Date(epochMs));
}

export function formatPlanningDate(ymd: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd;
  const stamp = Date.parse(`${ymd}T12:00:00Z`);
  if (!Number.isFinite(stamp)) return ymd;
  return new Intl.DateTimeFormat("nl-NL", {
    timeZone: "Europe/Amsterdam",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(stamp));
}

/** Titel volgt de planningdag die de service al gekozen heeft. Geen eigen werkdagrekening. */
export function shipPlanningTitle(ymd: string) {
  const label = formatPlanningDate(ymd);
  if (label === ymd) return "Schepenplanning";
  return `Schepenplanning ${label}`;
}

/** Subtiele markering alleen als de getoonde planningdag de Amsterdamse kalenderdag is. */
export function planningTodayMark(ymd: string, now = new Date()) {
  return ymd === amsterdamToday(now) ? "Vandaag" : null;
}

/** Dialooglabel. Alleen kalender vandaag of morgen; een latere planningdag krijgt geen extra woord. */
export function planningRelationLabel(ymd: string, now = new Date()) {
  if (ymd === amsterdamToday(now)) return "Vandaag";
  if (ymd === amsterdamTomorrow(now)) return "Morgen";
  return null;
}
