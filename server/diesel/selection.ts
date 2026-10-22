import { peildatumToCalendarIso } from "./peildatum.js";

/** Eén SharePoint-regel = één Planning-tegel. */
export type DieselSurchargeRecord = {
  itemId: string;
  referenceDate: string;
  websiteWeek: number;
  dieselPricePerLiter: number | null;
  rawSurchargePercentage: number;
  displaySurchargePercentage: number;
  /** Alleen informatief; beïnvloedt selectie niet. */
  actief: boolean;
};

export type DieselFieldNames = {
  peildatum: string;
  dieselPrijs: string;
  toeslagPercentage: string;
  websiteWeek: string;
  actief: string | null;
};

export type GraphColumn = {
  name: string;
  displayName: string;
};

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function floorSurchargePercentage(rawPercentage: number) {
  if (!Number.isFinite(rawPercentage)) {
    throw new Error("Toeslagpercentage is geen getal.");
  }
  return Math.floor(rawPercentage);
}

export function readDieselNumber(value: unknown, label: string) {
  const number =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.trim().replace(/\s/g, "").replace(",", "."))
        : Number.NaN;
  if (!Number.isFinite(number)) throw new Error(`${label} is geen getal.`);
  return number;
}

function tryReadNumber(value: unknown): number | null {
  try {
    return readDieselNumber(value, "n");
  } catch {
    return null;
  }
}

export function readOptionalActief(value: unknown) {
  if (value === undefined || value === null || value === "") return false;
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || value === "true" || value === "Ja") return true;
  if (value === 0 || value === "0" || value === "false" || value === "Nee") return false;
  return false;
}

export function readWebsiteWeek(value: unknown) {
  const number = readDieselNumber(value, "WebsiteWeek");
  if (!Number.isInteger(number) || number < 1 || number > 53) {
    throw new Error(`WebsiteWeek ongeldig: ${value}`);
  }
  return number;
}

/**
 * Kies de ToeslagPercent…-kolom met werkelijke decimale bronwaarden (28,90 / 32,76),
 * niet een afgeleide/hele-getallen-kolom wanneer er meerdere kandidaten zijn.
 */
export function pickToeslagPercentageColumnName(
  columns: GraphColumn[],
  fieldSamples: Record<string, unknown>[],
): string {
  const candidates = columns.filter(
    (column) =>
      normalizeName(column.displayName).startsWith("toeslagpercent") ||
      normalizeName(column.name).startsWith("toeslagpercent"),
  );
  if (candidates.length === 0) {
    throw new Error('Kolom met UI-header "ToeslagPercent…" ontbreekt in de SharePoint-lijst.');
  }
  if (candidates.length === 1) return candidates[0]!.name;

  let bestName = candidates[0]!.name;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const candidate of candidates) {
    let score = 0;
    for (const fields of fieldSamples) {
      const value = tryReadNumber(fields[candidate.name]);
      if (value == null) continue;
      if (value < 0 || value > 200) {
        score -= 2;
        continue;
      }
      score += 1;
      if (value >= 20 && value <= 60) score += 1;
      // Decimale bron (28.90, 32.76) wint van afgeleide gehele waarden.
      if (Math.abs(value - Math.round(value)) > 1e-9) score += 4;
    }
    if (score > bestScore) {
      bestScore = score;
      bestName = candidate.name;
    }
  }
  return bestName;
}

/**
 * Resolve Graph-interne kolomnamen. Toeslagkolom wordt gekozen via samplewaarden
 * wanneer meerdere ToeslagPercent…-kolommen bestaan.
 */
export function resolveDieselFieldNames(
  columns: GraphColumn[],
  fieldSamples: Record<string, unknown>[] = [],
): DieselFieldNames {
  const diesel =
    columns.find((column) => normalizeName(column.name) === "dieselprijsperliter") ||
    columns.find((column) => normalizeName(column.displayName) === "dieselprijsperliter");
  if (!diesel) {
    throw new Error('Kolom "DieselprijsPerLiter" ontbreekt in de SharePoint-lijst.');
  }

  const peildatum =
    columns.find((column) => normalizeName(column.name) === "peildatum") ||
    columns.find((column) => normalizeName(column.displayName) === "peildatum");
  if (!peildatum) {
    throw new Error('Kolom "Peildatum" ontbreekt in de SharePoint-lijst.');
  }

  const websiteWeek =
    columns.find((column) => normalizeName(column.name) === "websiteweek") ||
    columns.find((column) => normalizeName(column.displayName) === "websiteweek");
  if (!websiteWeek) {
    throw new Error('Kolom "WebsiteWeek" ontbreekt in de SharePoint-lijst.');
  }

  const toeslagPercentage = pickToeslagPercentageColumnName(columns, fieldSamples);

  const actief =
    columns.find((column) => normalizeName(column.name) === "actief") ||
    columns.find((column) => normalizeName(column.displayName) === "actief") ||
    null;

  return {
    peildatum: peildatum.name,
    dieselPrijs: diesel.name,
    toeslagPercentage,
    websiteWeek: websiteWeek.name,
    actief: actief?.name ?? null,
  };
}

export function mapSharePointFieldsToRecord(
  itemId: string,
  fields: Record<string, unknown>,
  names: DieselFieldNames,
): DieselSurchargeRecord {
  const peildatumRaw = fields[names.peildatum];
  if (typeof peildatumRaw !== "string" || !peildatumRaw.trim()) {
    throw new Error("Peildatum ontbreekt.");
  }
  const referenceDate = peildatumToCalendarIso(peildatumRaw);
  const websiteWeek = readWebsiteWeek(fields[names.websiteWeek]);
  const rawSurchargePercentage = readDieselNumber(fields[names.toeslagPercentage], "Toeslagpercentage");
  const displaySurchargePercentage = floorSurchargePercentage(rawSurchargePercentage);

  let dieselPricePerLiter: number | null = null;
  const dieselRaw = fields[names.dieselPrijs];
  if (dieselRaw !== undefined && dieselRaw !== null && dieselRaw !== "") {
    const parsed = readDieselNumber(dieselRaw, "DieselprijsPerLiter");
    dieselPricePerLiter = parsed > 0 ? parsed : null;
  }

  return {
    itemId: String(itemId),
    referenceDate,
    websiteWeek,
    dieselPricePerLiter,
    rawSurchargePercentage,
    displaySurchargePercentage,
    actief: names.actief ? readOptionalActief(fields[names.actief]) : false,
  };
}

/**
 * Selecteer exact de twee nieuwste records op Peildatum DESC.
 * Geen Actief-, WebsiteWeek- of kalenderweeklogica.
 */
export function selectLatestTwoByPeildatum(records: DieselSurchargeRecord[]): {
  latest: DieselSurchargeRecord | null;
  previous: DieselSurchargeRecord | null;
  sorted: DieselSurchargeRecord[];
} {
  const sorted = [...records].sort((left, right) => {
    const byDate = right.referenceDate.localeCompare(left.referenceDate);
    if (byDate !== 0) return byDate;
    return right.itemId.localeCompare(left.itemId);
  });
  return {
    latest: sorted[0] ?? null,
    previous: sorted[1] ?? null,
    sorted,
  };
}
