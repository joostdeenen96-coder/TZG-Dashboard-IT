import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { dataDir } from "../appPaths.js";
import type { DieselSurcharge, DieselSurchargeProvider, DieselWeek } from "../providers/dieselSurchargeProvider.js";
import { MockDieselProvider } from "../providers/mockDieselProvider.js";
import { SharePointDieselProvider } from "../providers/sharePointDieselProvider.js";

const dieselProviders = {
  mock: new MockDieselProvider(),
  sharepoint: new SharePointDieselProvider(),
} satisfies Record<string, DieselSurchargeProvider>;

type DieselSource = keyof typeof dieselProviders;

const activeDieselSource: DieselSource = "sharepoint";

function cacheFilePath() {
  return path.join(dataDir(), "diesel-week.json");
}
const MORNING_HOUR = 7;

type DieselCache = {
  periodKey: string;
  data: DieselSurcharge;
};

let memory: DieselCache | null | undefined;

export function dieselPeriodKey(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Amsterdam",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const hour = Number(parts.hour);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (hour < MORNING_HOUR) date.setUTCDate(date.getUTCDate() - 1);
  const keyMonth = String(date.getUTCMonth() + 1).padStart(2, "0");
  const keyDay = String(date.getUTCDate()).padStart(2, "0");
  return `${date.getUTCFullYear()}-${keyMonth}-${keyDay}`;
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

function readCache() {
  if (memory !== undefined) return memory;
  try {
    const parsed: unknown = JSON.parse(readFileSync(cacheFilePath(), "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      memory = null;
      return memory;
    }
    const row = parsed as Record<string, unknown>;
    memory = typeof row.periodKey === "string" && isSurcharge(row.data) ? { periodKey: row.periodKey, data: row.data } : null;
  } catch {
    memory = null;
  }
  return memory;
}

function writeCache(cache: DieselCache) {
  memory = cache;
  const file = cacheFilePath();
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(cache));
}

export async function getDieselSurcharge(): Promise<DieselSurcharge> {
  const periodKey = dieselPeriodKey();
  const cached = readCache();
  if (cached?.periodKey === periodKey) {
    console.info(`Dieseltoeslag uit ochtendcache ${periodKey}, peildatum ${cached.data.peildatum}.`);
    return cached.data;
  }

  try {
    const record = await dieselProviders[activeDieselSource].getCurrentData();
    console.info(
      `Dieseltoeslag via SharePointDieselProvider: peildatum ${record.peildatum}, WebsiteWeek ${record.websiteWeek}, raw ${record.toeslagPercentageRaw}% → ${record.toeslagPercentageDisplay}%, ${record.weken.length} tegels.`,
    );
    writeCache({ periodKey, data: record });
    console.info(`Dieseltoeslag bewaard voor ochtend ${periodKey}. Volgende lijstcontrole na 07:00.`);
    return record;
  } catch (error) {
    const message = error instanceof Error ? error.message : "onbekende fout";
    if (cached) {
      console.error(`Dieseltoeslag via ${activeDieselSource} mislukt (${message}). Laatste ochtendcache blijft staan.`);
      return cached.data;
    }
    const production = (process.env.NODE_ENV || "development") === "production";
    if (production || activeDieselSource === "mock") {
      console.error(`Dieseltoeslag via ${activeDieselSource} mislukt (${message}). Geen mock in productie.`);
      throw error;
    }
    console.error(`Dieseltoeslag via ${activeDieselSource} mislukt (${message}). Terugval op MockDieselProvider (development).`);
    return dieselProviders.mock.getCurrentData();
  }
}
