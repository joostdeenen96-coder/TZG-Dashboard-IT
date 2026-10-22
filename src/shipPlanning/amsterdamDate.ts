const YMD = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Amsterdam",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function amsterdamToday(now = new Date()) {
  return YMD.format(now);
}

export function formatPlanningDate(ymd: string) {
  const stamp = Date.parse(`${ymd}T12:00:00Z`);
  if (!Number.isFinite(stamp)) return ymd;
  return new Intl.DateTimeFormat("nl-NL", {
    timeZone: "Europe/Amsterdam",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(stamp));
}
