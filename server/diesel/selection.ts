import { isoWeekFromPeildatumIso, peildatumToCalendarIso } from "./peildatum.js";

/** Eén SharePoint-regel = één Planning-tegel. */
export type DieselSurchargeRecord = {
  itemId: string;
  referenceDate: string;
  isoWeek: number;
  dieselPricePerLiter: number;
  surchargePercentage: number;
  /** Alleen informatief; beïnvloedt selectie niet. */
  actief: boolean;
};

export type DieselFieldNames = {
  peildatum: string;
  dieselPrijs: string;
  toeslagPercentage: string;
  actief: string | null;
};

export type GraphColumn = {
  name: string;
  displayName: string;
};

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Resolve exacte Graph-interne kolomnamen.
 * Dieselprijs: DieselprijsPerLiter.
 * Toeslag: UI-header begint met ToeslagPercent… — interne naam via Graph, niet verzonnen.
 */
export function resolveDieselFieldNames(columns: GraphColumn[]): DieselFieldNames {
  const diesel =
    columns.find((column) => normalizeName(column.name) === "dieselprijsperliter") ||
    columns.find((column) => normalizeName(column.displayName) === "dieselprijsperliter");
  if (!diesel) {
    throw new Error('Kolom "DieselprijsPerLiter" ontbreekt in de SharePoint-lijst.');
  }

  const toeslag =
    columns.find((column) => normalizeName(column.displayName).startsWith("toeslagpercent")) ||
    columns.find((column) => normalizeName(column.name).startsWith("toeslagpercent"));
  if (!toeslag) {
    throw new Error('Kolom met UI-header "ToeslagPercent…" ontbreekt in de SharePoint-lijst.');
  }

  const peildatum =
    columns.find((column) => normalizeName(column.name) === "peildatum") ||
    columns.find((column) => normalizeName(column.displayName) === "peildatum");
  if (!peildatum) {
    throw new Error('Kolom "Peildatum" ontbreekt in de SharePoint-lijst.');
  }

  const actief =
    columns.find((column) => normalizeName(column.name) === "actief") ||
    columns.find((column) => normalizeName(column.displayName) === "actief") ||
    null;

  return {
    peildatum: peildatum.name,
    dieselPrijs: diesel.name,
    toeslagPercentage: toeslag.name,
    actief: actief?.name ?? null,
  };
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

export function readOptionalActief(value: unknown) {
  if (value === undefined || value === null || value === "") return false;
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || value === "true" || value === "Ja") return true;
  if (value === 0 || value === "0" || value === "false" || value === "Nee") return false;
  return false;
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
  const dieselPricePerLiter = readDieselNumber(fields[names.dieselPrijs], "DieselprijsPerLiter");
  const surchargePercentage = readDieselNumber(fields[names.toeslagPercentage], "Toeslagpercentage");
  if (dieselPricePerLiter <= 0) throw new Error("DieselprijsPerLiter moet positief zijn.");
  if (!Number.isFinite(surchargePercentage)) throw new Error("Toeslagpercentage ongeldig.");
  const { isoWeek } = isoWeekFromPeildatumIso(referenceDate);
  return {
    itemId: String(itemId),
    referenceDate,
    isoWeek,
    dieselPricePerLiter,
    surchargePercentage,
    actief: names.actief ? readOptionalActief(fields[names.actief]) : false,
  };
}

/**
 * Selecteer exact de twee nieuwste records op Peildatum DESC.
 * Geen Actief-filter, geen ISO-week pairing, geen kalenderweeklogica.
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
