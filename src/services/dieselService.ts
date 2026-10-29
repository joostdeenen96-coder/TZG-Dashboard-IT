import { useSyncExternalStore } from "react";
import type { DieselSurcharge, DieselWeek } from "../types";

import { createPollingFeed } from "./tvFeed";

const DIESEL_PATH = "/api/dieselsurcharge";

function mapWeek(value: unknown): DieselWeek | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.peildatum !== "string" ||
    typeof row.websiteWeek !== "number" ||
    typeof row.toeslagPercentage !== "number" ||
    typeof row.actief !== "boolean"
  ) {
    return null;
  }
  const dieselPrijs =
    row.dieselPrijs === null
      ? null
      : typeof row.dieselPrijs === "number"
        ? row.dieselPrijs
        : null;
  if (row.dieselPrijs !== null && typeof row.dieselPrijs !== "number") return null;

  const raw =
    typeof row.toeslagPercentageRaw === "number" ? row.toeslagPercentageRaw : row.toeslagPercentage;
  const display =
    typeof row.toeslagPercentageDisplay === "number"
      ? row.toeslagPercentageDisplay
      : row.toeslagPercentage;

  return {
    itemId: typeof row.itemId === "string" ? row.itemId : undefined,
    peildatum: row.peildatum,
    websiteWeek: row.websiteWeek,
    dieselPrijs,
    toeslagPercentage: display,
    toeslagPercentageRaw: raw,
    toeslagPercentageDisplay: display,
    actief: row.actief,
  };
}

function mapPayload(payload: unknown): DieselSurcharge | "empty" {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Dieseltoeslag heeft een ongeldig formaat.");
  }
  const row = payload as Record<string, unknown>;
  if (typeof row.error === "string" && row.error.trim()) throw new Error(row.error);
  if (Object.keys(row).length === 0) return "empty";
  const current = mapWeek(row);
  if (!current) throw new Error("Dieseltoeslag heeft een ongeldig formaat.");
  const parsedWeeks = Array.isArray(row.weken)
    ? row.weken.map(mapWeek).filter((week): week is DieselWeek => week !== null)
    : [];
  return {
    ...current,
    weken: (parsedWeeks.length > 0 ? parsedWeeks : [current])
      .sort((left, right) => Date.parse(right.peildatum) - Date.parse(left.peildatum))
      .slice(0, 2),
    stale: row.stale === true,
  };
}

async function loadDiesel(signal: AbortSignal): Promise<DieselSurcharge | "empty"> {
  const response = await fetch(DIESEL_PATH, { signal });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
        ? payload.error
        : `Dieseltoeslag antwoordde met ${response.status}.`;
    throw new Error(message);
  }
  return mapPayload(payload);
}

function acceptDiesel(value: unknown): DieselSurcharge | null {
  try {
    const mapped = mapPayload(value);
    return mapped === "empty" ? null : mapped;
  } catch {
    return null;
  }
}

const dieselFeed = createPollingFeed<DieselSurcharge>({
  name: "dieseltoeslag",
  storageKey: "teunesen.tv.diesel.v2",
  unavailable: "Dieseltoeslag niet bereikbaar.",
  load: loadDiesel,
  accept: acceptDiesel,
});

export function useDieselSurcharge() {
  return useSyncExternalStore(dieselFeed.subscribe, dieselFeed.getSnapshot, dieselFeed.getSnapshot);
}
