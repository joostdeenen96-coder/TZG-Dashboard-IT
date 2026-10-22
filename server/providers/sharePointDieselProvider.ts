import {
  mapSharePointFieldsToRecord,
  resolveDieselFieldNames,
  selectLatestTwoByPeildatum,
  type DieselSurchargeRecord,
} from "../diesel/selection.js";
import { getDashboardConfig } from "../services/dashboardConfig.js";
import { graphGet, graphUrl, resetGraphCache } from "../services/graphClient.js";
import { sharePointGraphPath } from "../services/settingsService.js";
import type { DieselSurcharge, DieselSurchargeProvider, DieselWeek } from "./dieselSurchargeProvider.js";

export { resetGraphCache };
export {
  floorSurchargePercentage,
  mapSharePointFieldsToRecord,
  pickToeslagPercentageColumnName,
  resolveDieselFieldNames,
  selectLatestTwoByPeildatum,
} from "../diesel/selection.js";
export { peildatumToCalendarIso } from "../diesel/peildatum.js";

type GraphColumn = {
  name: string;
  displayName: string;
};

function asObject(value: unknown, message: string) {
  if (!value || typeof value !== "object") throw new Error(message);
  return value as Record<string, unknown>;
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

function recordToWeek(record: DieselSurchargeRecord): DieselWeek {
  return {
    itemId: record.itemId,
    peildatum: record.referenceDate,
    websiteWeek: record.websiteWeek,
    dieselPrijs: record.dieselPricePerLiter,
    toeslagPercentage: record.displaySurchargePercentage,
    toeslagPercentageRaw: record.rawSurchargePercentage,
    toeslagPercentageDisplay: record.displaySurchargePercentage,
    actief: record.actief,
  };
}

function mapItemsToRecords(items: Record<string, unknown>[], names: ReturnType<typeof resolveDieselFieldNames>) {
  const records: DieselSurchargeRecord[] = [];
  for (const item of items) {
    try {
      const itemId = typeof item.id === "string" || typeof item.id === "number" ? String(item.id) : "";
      if (!itemId) throw new Error("itemId ontbreekt.");
      records.push(
        mapSharePointFieldsToRecord(itemId, asObject(item.fields, "Velden van het dieselrecord ontbreken."), names),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "record overgeslagen";
      console.error(`Dieselrecord overgeslagen (${message}).`);
    }
  }
  return records;
}

/** Bouw API-payload: weken[0]=nieuwste peildatum, weken[1]=een-na-nieuwste. */
export function buildDieselSurchargeFromRecords(records: DieselSurchargeRecord[]): DieselSurcharge {
  const { latest, previous } = selectLatestTwoByPeildatum(records);
  if (!latest) throw new Error("Geen geldige SharePoint-dieselrecords met peildatum en toeslag.");
  const weken = previous ? [recordToWeek(latest), recordToWeek(previous)] : [recordToWeek(latest)];
  return {
    ...recordToWeek(latest),
    weken,
  };
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

    const columns = (
      await graphList(
        graphUrl(`/sites/${siteId}/lists/${listId}/columns`, { $select: "name,displayName", $top: "200" }),
      )
    ).filter(
      (column): column is GraphColumn => typeof column.name === "string" && typeof column.displayName === "string",
    );

    const items = await graphList(
      graphUrl(`/sites/${siteId}/lists/${listId}/items`, {
        $expand: "fields",
        $top: "200",
      }),
    );

    const fieldSamples = items.map((item) => asObject(item.fields ?? {}, "Velden ontbreken."));
    const names = resolveDieselFieldNames(columns, fieldSamples);
    console.info(
      `SharePoint diesel kolommen: Peildatum=${names.peildatum}, WebsiteWeek=${names.websiteWeek}, ` +
        `DieselprijsPerLiter=${names.dieselPrijs}, Toeslag=${names.toeslagPercentage}` +
        (names.actief ? `, Actief=${names.actief} (niet gebruikt voor selectie)` : " (geen Actief-kolom)"),
    );

    const records = mapItemsToRecords(items, names);
    const payload = buildDieselSurchargeFromRecords(records);
    const previous = payload.weken[1];
    console.info(
      `SharePoint diesel (${listName}): nieuwste peildatum ${payload.peildatum} WebsiteWeek ${payload.websiteWeek} ` +
        `raw ${payload.toeslagPercentageRaw}% → display ${payload.toeslagPercentageDisplay}%, ` +
        (previous
          ? `een-na-nieuwste ${previous.peildatum} WebsiteWeek ${previous.websiteWeek}, `
          : "geen een-na-nieuwste, ") +
        `${records.length} geldige rijen.`,
    );
    return payload;
  }
}
