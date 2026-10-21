import { getDashboardConfig } from "../services/dashboardConfig.js";
import { graphGet, graphUrl, resetGraphCache } from "../services/graphClient.js";
import { sharePointGraphPath } from "../services/settingsService.js";
import type { DieselSurcharge, DieselSurchargeProvider, DieselWeek } from "./dieselSurchargeProvider.js";

export { resetGraphCache };

type GraphColumn = {
  name: string;
  displayName: string;
};

type FieldNames = {
  actief: string;
  peildatum: string;
  dieselPrijs: string;
  toeslagPercentage: string;
};

function asObject(value: unknown, message: string) {
  if (!value || typeof value !== "object") throw new Error(message);
  return value as Record<string, unknown>;
}

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function graphList(url: URL) {
  const rows: Record<string, unknown>[] = [];
  let next: URL | null = url;
  for (let page = 0; page < 5 && next; page += 1) {
    const payload = asObject(await graphGet(next), "Graph-lijst is ongeldig.");
    if (!Array.isArray(payload.value)) throw new Error("Graph-lijst is ongeldig.");
    for (const item of payload.value) rows.push(asObject(item, "Graph-item is ongeldig."));
    next = typeof payload["@odata.nextLink"] === "string" ? new URL(payload["@odata.nextLink"]) : null;
    if (next && next.origin !== "https://graph.microsoft.com") {
      throw new Error("Onverwachte Graph-vervolgkoppeling.");
    }
  }
  return rows;
}

function columnName(columns: GraphColumn[], keys: string[]) {
  for (const key of keys) {
    const found = columns.find(
      (column) => normalizeName(column.displayName) === key || normalizeName(column.name) === key,
    );
    if (found) return found.name;
  }
  throw new Error(`Kolom ${keys[0]} ontbreekt in de lijst.`);
}

function readNumber(value: unknown, label: string) {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value.replace(",", ".")) : Number.NaN;
  if (!Number.isFinite(number)) throw new Error(`${label} is geen getal.`);
  return number;
}

function readBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || value === "true" || value === "Ja") return true;
  if (value === 0 || value === "0" || value === "false" || value === "Nee") return false;
  throw new Error("Actief is ongeldig.");
}

function readPeildatum(value: unknown) {
  if (typeof value !== "string" || !value.trim()) throw new Error("Peildatum ontbreekt.");
  return value;
}

function toSurcharge(fields: Record<string, unknown>, names: FieldNames): DieselWeek {
  return {
    peildatum: readPeildatum(fields[names.peildatum]),
    dieselPrijs: readNumber(fields[names.dieselPrijs], "Dieselprijs"),
    toeslagPercentage: readNumber(fields[names.toeslagPercentage], "Toeslagpercentage"),
    actief: readBoolean(fields[names.actief]),
  };
}

function isoWeekKey(peildatum: string) {
  const time = Date.parse(peildatum);
  if (!Number.isFinite(time)) return peildatum;
  const date = new Date(time);
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const weekday = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - weekday);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function mapRecords(items: Record<string, unknown>[], names: FieldNames) {
  const records: DieselWeek[] = [];
  for (const item of items) {
    try {
      records.push(toSurcharge(asObject(item.fields, "Velden van het dieselrecord ontbreken."), names));
    } catch (error) {
      const message = error instanceof Error ? error.message : "record overgeslagen";
      console.error(`Dieselrecord overgeslagen (${message}).`);
    }
  }
  return records;
}

function pickActive(records: DieselWeek[]) {
  const active = records.filter((record) => record.actief);
  if (active.length === 0) throw new Error("Geen record met Actief = true.");
  active.sort((left, right) => Date.parse(right.peildatum) - Date.parse(left.peildatum));
  return active[0];
}

function latestDistinctWeeks(records: DieselWeek[], count: number) {
  const byWeek = new Map<string, DieselWeek>();
  const chronological = [...records].sort((left, right) => Date.parse(left.peildatum) - Date.parse(right.peildatum));
  for (const record of chronological) {
    if (!Number.isFinite(Date.parse(record.peildatum))) continue;
    // Later peildatum within the same ISO-week wins.
    byWeek.set(isoWeekKey(record.peildatum), record);
  }
  return [...byWeek.values()]
    .sort((left, right) => Date.parse(right.peildatum) - Date.parse(left.peildatum))
    .slice(0, count)
    .sort((left, right) => Date.parse(left.peildatum) - Date.parse(right.peildatum));
}

/**
 * Planning toont huidige + vorige dieselweek. Neem altijd het actieve record op
 * en vul aan met eerdere ISO-weken uit SharePoint-historie (Actief true/false).
 */
function weeksForPlanning(active: DieselWeek, records: DieselWeek[]): DieselWeek[] {
  const history = latestDistinctWeeks(records, 8);
  const activeKey = isoWeekKey(active.peildatum);
  const withoutActiveWeek = history.filter((row) => isoWeekKey(row.peildatum) !== activeKey);
  const previous = withoutActiveWeek
    .filter((row) => Date.parse(row.peildatum) < Date.parse(active.peildatum))
    .sort((left, right) => Date.parse(right.peildatum) - Date.parse(left.peildatum))[0];
  const weken = previous ? [previous, active] : [active];
  if (!previous) {
    console.warn(
      `SharePoint diesel: geen vorige week vóór peildatum ${active.peildatum} gevonden in ${records.length} rijen.`,
    );
  } else {
    console.info(
      `SharePoint diesel: huidige peildatum ${active.peildatum}, vorige peildatum ${previous.peildatum}.`,
    );
  }
  return weken;
}

function withWeeks(active: DieselWeek, records: DieselWeek[]): DieselSurcharge {
  const weken = weeksForPlanning(active, records);
  return { ...active, weken };
}

function odataText(value: string) {
  return value.replaceAll("'", "''");
}

async function openActiveList(siteUrl?: string, listName?: string) {
  const config = getDashboardConfig();
  const siteAddress = siteUrl ?? config.sharepointDiesel.siteUrl;
  const name = listName ?? config.sharepointDiesel.lijstnaam;
  const site = asObject(await graphGet(graphUrl(sharePointGraphPath(siteAddress))), "SharePoint-site is ongeldig.");
  if (typeof site.id !== "string") throw new Error("SharePoint-site niet gevonden.");
  const lists = await graphList(
    graphUrl(`/sites/${site.id}/lists`, {
      $select: "id,displayName",
      $filter: `displayName eq '${odataText(name)}'`,
    }),
  );
  const list = lists.find((item) => item.displayName === name);
  if (!list || typeof list.id !== "string") throw new Error(`Lijst ${name} niet gevonden.`);
  return { siteId: site.id, listId: list.id, listName: name };
}

export async function testSharePointConnection(siteUrl?: string, listName?: string) {
  const found = await openActiveList(siteUrl, listName);
  return `Dieseltoeslag: lijst ${found.listName} gevonden.`;
}

export class SharePointDieselProvider implements DieselSurchargeProvider {
  async getCurrentData(): Promise<DieselSurcharge> {
    const { siteId, listId, listName } = await openActiveList();
    const site = { id: siteId };
    const list = { id: listId };

    const columns = (await graphList(
      graphUrl(`/sites/${site.id}/lists/${list.id}/columns`, { $select: "name,displayName", $top: "200" }),
    ))
      .filter((column): column is GraphColumn => typeof column.name === "string" && typeof column.displayName === "string");
    const names: FieldNames = {
      actief: columnName(columns, ["actief"]),
      peildatum: columnName(columns, ["peildatum"]),
      dieselPrijs: columnName(columns, ["dieselprijsperliter", "dieselprijs", "gasolieprijs"]),
      toeslagPercentage: columnName(columns, ["toeslagpercentage", "toeslag"]),
    };

    const items = await graphList(
      graphUrl(`/sites/${site.id}/lists/${list.id}/items`, {
        $expand: "fields",
        $top: "200",
      }),
    );

    const records = mapRecords(items, names);
    const activeCount = records.filter((record) => record.actief).length;
    console.info(`Actief = true gezocht in ${listName}: ${activeCount} van ${records.length} rijen.`);
    const record = withWeeks(pickActive(records), records);
    console.info(
      `Actief dieselrecord uit SharePoint, peildatum ${record.peildatum}, ${record.weken.length} weekregels.`,
    );
    return record;
  }
}
