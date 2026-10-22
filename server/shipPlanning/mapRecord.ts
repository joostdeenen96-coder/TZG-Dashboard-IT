import { formatAmsterdamDate, formatAmsterdamTime } from "./dates.js";
import type { ShipPlanningEntry } from "./model.js";

/**
 * Alleen paden die de plugin zelf projecteert.
 * Een doelveld blijft null als het pad ontbreekt of leeg is.
 * quantityUnit heeft geen bronattribuut in de plugin (weergave " t" is hardcoded in de UI).
 */
export const PROVEN_PATHS = {
  sourceOrder: "volgorde",
  loadingLocation: "laadplaats.zoeknaam",
  time: "laaddatum",
  customer: "klant.zoeknaam",
  unloadingLocation: "losplaats.naam",
  condition: "conditie.omschrijving",
  product: "product.naam",
  quantity: "geplande_hoeveelheid",
  vessel: "schip.naam",
  orderNumber: "ordernummer",
  carrier: "vervoerder.naam",
  phoneNumber: "schip.telefoonnummer_schipper",
  unloadingDate: "losdatum",
  planningRemark: "opmerkingenveld_planning",
} as const;

export type ProvenPathKey = keyof typeof PROVEN_PATHS;

export function entityDataRoot(entity: unknown): Record<string, unknown> {
  if (!entity || typeof entity !== "object" || Array.isArray(entity)) return {};
  const row = entity as Record<string, unknown>;
  const attributes = row.attributes;
  if (attributes && typeof attributes === "object" && !Array.isArray(attributes)) {
    return { ...(attributes as Record<string, unknown>) };
  }
  return row;
}

export function readPath(root: Record<string, unknown>, pathName: string): { present: boolean; value: unknown } {
  if (Object.prototype.hasOwnProperty.call(root, pathName)) {
    return { present: true, value: root[pathName] };
  }
  const parts = pathName.split(".");
  let current: unknown = root;
  for (const part of parts) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return { present: false, value: undefined };
    const record = current as Record<string, unknown>;
    if (!Object.prototype.hasOwnProperty.call(record, part)) return { present: false, value: undefined };
    current = record[part];
  }
  return { present: true, value: current };
}

function textValue(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function epochMs(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

function sourceIdOf(entity: unknown): string | null {
  if (!entity || typeof entity !== "object") return null;
  const row = entity as Record<string, unknown>;
  for (const key of ["entityId", "id", "resourceId"]) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

export function mapShipPlanningEntry(entity: unknown): ShipPlanningEntry {
  const root = entityDataRoot(entity);
  const read = (key: ProvenPathKey) => readPath(root, PROVEN_PATHS[key]);
  const laaddatum = epochMs(read("time").present ? read("time").value : null);
  const losdatum = epochMs(read("unloadingDate").present ? read("unloadingDate").value : null);
  return {
    sourceId: sourceIdOf(entity),
    sourceOrder: numberValue(read("sourceOrder").present ? read("sourceOrder").value : null),
    loadingLocation: textValue(read("loadingLocation").present ? read("loadingLocation").value : null),
    time: laaddatum == null ? null : formatAmsterdamTime(laaddatum),
    customer: textValue(read("customer").present ? read("customer").value : null),
    unloadingLocation: textValue(read("unloadingLocation").present ? read("unloadingLocation").value : null),
    condition: textValue(read("condition").present ? read("condition").value : null),
    product: textValue(read("product").present ? read("product").value : null),
    quantity: numberValue(read("quantity").present ? read("quantity").value : null),
    quantityUnit: null,
    vessel: textValue(read("vessel").present ? read("vessel").value : null),
    orderNumber: textValue(read("orderNumber").present ? read("orderNumber").value : null),
    carrier: textValue(read("carrier").present ? read("carrier").value : null),
    phoneNumber: textValue(read("phoneNumber").present ? read("phoneNumber").value : null),
    unloadingDate: losdatum == null ? textValue(read("unloadingDate").present ? read("unloadingDate").value : null) : formatAmsterdamDate(losdatum),
    planningRemark: textValue(read("planningRemark").present ? read("planningRemark").value : null),
  };
}

export function compareSourceOrder(left: ShipPlanningEntry, right: ShipPlanningEntry) {
  const leftOrder = left.sourceOrder;
  const rightOrder = right.sourceOrder;
  if (leftOrder != null && rightOrder != null && leftOrder !== rightOrder) return leftOrder - rightOrder;
  if (leftOrder != null && rightOrder == null) return -1;
  if (leftOrder == null && rightOrder != null) return 1;
  return 0;
}

export function orderEntries(entries: ShipPlanningEntry[]) {
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((left, right) => {
      const bySource = compareSourceOrder(left.entry, right.entry);
      if (bySource !== 0) return bySource;
      return left.index - right.index;
    })
    .map((row) => row.entry);
}
