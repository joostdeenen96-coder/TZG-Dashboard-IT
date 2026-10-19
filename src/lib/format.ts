const htmlEntities: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** Maakt PRTG-teksten leesbaar: &#39; → ', tags weg. */
export function cleanPrtgText(value: string) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    })
    .replace(/&#(\d+);/g, (_, dec: string) => {
      const code = Number(dec);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    })
    .replace(/&([a-zA-Z]+);/g, (match, name: string) => htmlEntities[name.toLowerCase()] ?? match)
    .replace(/\s+/g, " ")
    .trim();
}

const stampFormatter = new Intl.DateTimeFormat("nl-NL", {
  timeZone: "Europe/Amsterdam",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) {
  return parts.find((item) => item.type === type)?.value ?? "";
}

export function formatAmsterdamStamp(now: Date) {
  const parts = stampFormatter.formatToParts(now);
  const weekday = part(parts, "weekday");
  const day = part(parts, "day");
  const month = part(parts, "month");
  const year = part(parts, "year");
  const hour = part(parts, "hour");
  const minute = part(parts, "minute");
  const second = part(parts, "second");
  return `${weekday} ${day} ${month} ${year} · ${hour}:${minute}:${second}`;
}

const percentFormatter = new Intl.NumberFormat("nl-NL", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function formatDutchPercent(value: number) {
  return percentFormatter.format(value);
}

export function formatRelativeDutch(iso: string, now: Date) {
  const deltaSec = Math.round((now.getTime() - new Date(iso).getTime()) / 1000);
  if (deltaSec < 45) return "zojuist";
  const minutes = Math.round(deltaSec / 60);
  if (minutes < 60) return `${minutes} min geleden`;
  const hours = Math.round(minutes / 60);
  if (hours < 20) return hours === 1 ? "1 uur geleden" : `${hours} uur geleden`;
  const days = Math.max(1, Math.round(hours / 24));
  if (days === 1) return "gisteren";
  return `${days} dagen geleden`;
}

const clockFormatter = new Intl.DateTimeFormat("nl-NL", {
  timeZone: "Europe/Amsterdam",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function formatAmsterdamTime(iso: string) {
  return clockFormatter.format(new Date(iso));
}

const publicationFormatter = new Intl.DateTimeFormat("nl-NL", {
  timeZone: "Europe/Amsterdam",
  day: "numeric",
  month: "long",
  year: "numeric",
});

export function formatPublicationDate(iso: string) {
  return publicationFormatter.format(new Date(iso));
}

const euroFormatter = new Intl.NumberFormat("nl-NL", {
  style: "currency",
  currency: "EUR",
});

export function formatEuro(value: number) {
  return euroFormatter.format(value);
}

export function formatDieselChange(points: number) {
  const amount = formatDutchPercent(Math.abs(points));
  if (points < 0) return `${amount} procentpunt lager dan gisteren`;
  if (points > 0) return `${amount} procentpunt hoger dan gisteren`;
  return "gelijk aan gisteren";
}

export function formatWaterChange(changeCm: number) {
  if (changeCm < 0) return `${Math.abs(changeCm)} cm lager dan gisteren`;
  if (changeCm > 0) return `${changeCm} cm hoger dan gisteren`;
  return "gelijk aan gisteren";
}
