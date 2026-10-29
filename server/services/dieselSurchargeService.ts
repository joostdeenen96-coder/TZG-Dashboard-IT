import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { dataDir } from "../appPaths.js";
import { logError, logInfo } from "../log.js";
import type { DieselSurcharge, DieselSurchargeProvider, DieselWeek } from "../providers/dieselSurchargeProvider.js";
import { MockDieselProvider } from "../providers/mockDieselProvider.js";
import { SharePointDieselProvider } from "../providers/sharePointDieselProvider.js";

const dieselProviders = {
  mock: new MockDieselProvider(),
  sharepoint: new SharePointDieselProvider(),
} satisfies Record<string, DieselSurchargeProvider>;

type DieselSource = keyof typeof dieselProviders;

const activeDieselSource: DieselSource = "sharepoint";

/** SharePoint opnieuw controleren na vijf minuten. */
export const DIESEL_REFRESH_TTL_MS = 300_000;

function cacheFilePath() {
  return cacheFileOverride ?? path.join(dataDir(), "diesel-week.json");
}

type DieselCache = {
  fetchedAt: number;
  data: DieselSurcharge;
  stale: boolean;
};

let memory: DieselCache | null | undefined;
let inflight: Promise<DieselSurcharge> | null = null;
let providerOverride: DieselSurchargeProvider | null = null;
let cacheFileOverride: string | null = null;
let clock = () => Date.now();

function activeProvider() {
  return providerOverride ?? dieselProviders[activeDieselSource];
}

function isWeek(value: unknown): value is DieselWeek {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  const dieselOk = row.dieselPrijs === null || typeof row.dieselPrijs === "number";
  return (
    typeof row.peildatum === "string" &&
    typeof row.websiteWeek === "number" &&
    dieselOk &&
    typeof row.toeslagPercentage === "number" &&
    typeof row.toeslagPercentageRaw === "number" &&
    typeof row.toeslagPercentageDisplay === "number" &&
    typeof row.actief === "boolean" &&
    (row.itemId === undefined || typeof row.itemId === "string")
  );
}

function isSurcharge(value: unknown): value is DieselSurcharge {
  if (!isWeek(value)) return false;
  const row = value as DieselSurcharge;
  return Array.isArray(row.weken) && row.weken.every(isWeek);
}

function stripStale(data: DieselSurcharge): DieselSurcharge {
  const copy: DieselSurcharge = { ...data, weken: data.weken.map((week) => ({ ...week })) };
  delete copy.stale;
  return copy;
}

function readCache() {
  if (memory !== undefined) return memory;
  try {
    const parsed: unknown = JSON.parse(readFileSync(cacheFilePath(), "utf8"));
    memory = parseStoredCache(parsed);
  } catch {
    memory = null;
  }
  return memory;
}

function parseStoredCache(parsed: unknown): DieselCache | null {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const row = parsed as Record<string, unknown>;
  if (!isSurcharge(row.data)) return null;
  if (typeof row.fetchedAt === "number" && Number.isFinite(row.fetchedAt)) {
    return { fetchedAt: row.fetchedAt, data: stripStale(row.data), stale: row.stale === true };
  }
  if (typeof row.periodKey === "string") {
    return { fetchedAt: 0, data: stripStale(row.data), stale: false };
  }
  return null;
}

function writeCache(cache: DieselCache) {
  const stored: DieselCache = { fetchedAt: cache.fetchedAt, data: stripStale(cache.data), stale: cache.stale };
  memory = stored;
  const file = cacheFilePath();
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(stored));
}

function serve(cache: DieselCache): DieselSurcharge {
  return cache.stale ? { ...cache.data, stale: true } : cache.data;
}

async function refreshFromSource(cached: DieselCache | null): Promise<DieselSurcharge> {
  logInfo("diesel SharePoint refresh gestart");
  try {
    const record = stripStale(await activeProvider().getCurrentData());
    logInfo(
      `diesel SharePoint refresh succesvol, recordcount ${record.weken.length}, nieuwste Peildatum ${record.peildatum}, WebsiteWeek ${record.websiteWeek}`,
    );
    writeCache({ fetchedAt: clock(), data: record, stale: false });
    return record;
  } catch (error) {
    const message = error instanceof Error ? error.message : "onbekende fout";
    if (cached) {
      logError(`diesel SharePoint refresh mislukt (${message}). cache stale`);
      const stale: DieselCache = { fetchedAt: clock(), data: cached.data, stale: true };
      writeCache(stale);
      return serve(stale);
    }
    logError(`diesel SharePoint refresh mislukt (${message}).`);
    const production = (process.env.NODE_ENV || "development") === "production";
    if (production || activeDieselSource === "mock") {
      logError(`Dieseltoeslag via ${activeDieselSource} mislukt. Geen mock in productie.`);
      throw error;
    }
    logError(`Dieseltoeslag via ${activeDieselSource} mislukt. Terugval op MockDieselProvider (development).`);
    return dieselProviders.mock.getCurrentData();
  }
}

export async function getDieselSurcharge(): Promise<DieselSurcharge> {
  const cached = readCache();
  if (cached && clock() - cached.fetchedAt < DIESEL_REFRESH_TTL_MS) {
    return serve(cached);
  }
  if (!inflight) {
    const pending = refreshFromSource(cached).finally(() => {
      if (inflight === pending) inflight = null;
    });
    inflight = pending;
  }
  return inflight;
}

export function setDieselProviderForTests(provider: DieselSurchargeProvider | null) {
  providerOverride = provider;
}

export function setDieselClockForTests(now: (() => number) | null) {
  clock = now ?? (() => Date.now());
}

export function setDieselCacheFileForTests(file: string | null) {
  cacheFileOverride = file;
  memory = undefined;
  inflight = null;
}

export function resetDieselSurchargeForTests() {
  providerOverride = null;
  cacheFileOverride = null;
  clock = () => Date.now();
  memory = undefined;
  inflight = null;
}
