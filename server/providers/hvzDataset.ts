import { classifyWaterLevel } from "../water/classifyWaterLevel.js";
import { decodeLatin1, fetchBytes } from "./http.js";
import { trendFromChange, type WaterStatus, type WaterTrend } from "./waterLevelProvider.js";

const STATION_URL = "https://www.hvz.baden-wuerttemberg.de/js/hvz_peg_stmn.js";
const DAILY_URL = "https://www.hvz.baden-wuerttemberg.de/js/dat-peg-tmv.js";

const STATION_ID = "09016";
const LEVEL_INDEX = 4;
const UNIT_INDEX = 5;
const TIME_INDEX = 6;
const FLOOD_INDEX = 30;
const LOW_INDEX = 43;

export type HvzReading = {
  levelCm: number;
  changeCm: number;
  trend: WaterTrend;
  status: WaterStatus;
  updatedAt: string;
};

function parseJsArray(source: string, start: number): unknown[] {
  if (source[start] !== "[") throw new Error("HVZ-record ontbreekt.");
  const items: unknown[] = [];
  let index = start + 1;
  while (index < source.length) {
    while (source[index] === " " || source[index] === "\n" || source[index] === "\r" || source[index] === "\t") index += 1;
    if (source[index] === "]") return items;
    if (source[index] === "'") {
      index += 1;
      let value = "";
      while (index < source.length && source[index] !== "'") {
        if (source[index] === "\\") {
          value += source[index + 1] ?? "";
          index += 2;
          continue;
        }
        value += source[index];
        index += 1;
      }
      if (source[index] !== "'") throw new Error("HVZ-record is onvolledig.");
      index += 1;
      items.push(value);
    } else {
      const end = index + source.slice(index).search(/[,\]\s]/);
      const token = source.slice(index, end === index - 1 ? source.length : end).trim();
      if (!token) throw new Error("HVZ-record is onvolledig.");
      const numeric = Number(token);
      items.push(Number.isFinite(numeric) ? numeric : token);
      index = end === index - 1 ? source.length : end;
    }
    while (source[index] === " " || source[index] === "\n" || source[index] === "\r" || source[index] === "\t") index += 1;
    if (source[index] === ",") {
      index += 1;
      continue;
    }
    if (source[index] === "]") return items;
    throw new Error("HVZ-record is onvolledig.");
  }
  throw new Error("HVZ-record is onvolledig.");
}

function fieldNumber(items: unknown[], index: number, label: string) {
  const value = Number(items[index]);
  if (!Number.isFinite(value)) throw new Error(`${label} ontbreekt in de HVZ-dataset.`);
  return value;
}

function parseUpdatedAt(value: unknown) {
  if (typeof value !== "string") throw new Error("Tijdstip van Maxau ontbreekt.");
  const match = /^(\d{2})\.(\d{2})\.(\d{4}) (\d{2}):(\d{2}) (MESZ|MEZ)$/.exec(value.trim());
  if (!match) throw new Error("Tijdstip van Maxau is ongeldig.");
  const offset = match[6] === "MESZ" ? "+02:00" : "+01:00";
  return `${match[3]}-${match[2]}-${match[1]}T${match[4]}:${match[5]}:00${offset}`;
}

function previousDay(iso: string) {
  const [date] = iso.split("T");
  const [year, month, day] = date.split("-").map(Number);
  const stamp = new Date(Date.UTC(year, month - 1, day));
  stamp.setUTCDate(stamp.getUTCDate() - 1);
  const dd = String(stamp.getUTCDate()).padStart(2, "0");
  const mm = String(stamp.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${stamp.getUTCFullYear()}`;
}

export async function readMaxauFromHvz(): Promise<HvzReading> {
  const [stationBytes, dailyBytes] = await Promise.all([fetchBytes(STATION_URL), fetchBytes(DAILY_URL)]);
  const stations = decodeLatin1(stationBytes);
  const daily = decodeLatin1(dailyBytes);
  const marker = `['${STATION_ID}','Maxau'`;
  const at = stations.indexOf(marker);
  if (at < 0) throw new Error("Pegel Maxau ontbreekt in de HVZ-dataset.");
  const record = parseJsArray(stations, at);
  if (record[UNIT_INDEX] !== "cm") throw new Error("Waterstand van Maxau staat niet in centimeter.");
  const levelCm = Math.round(fieldNumber(record, LEVEL_INDEX, "Waterstand"));
  const updatedAt = parseUpdatedAt(record[TIME_INDEX]);
  fieldNumber(record, LOW_INDEX, "MNW");
  fieldNumber(record, FLOOD_INDEX, "Hoogwaterstand");
  const status = classifyWaterLevel("maxau", levelCm);
  if (!status) throw new Error("Actuele waterstand van Maxau is ongeldig.");
  const tmvKey = String(Number(STATION_ID));
  const dailyMatch = new RegExp(`${tmvKey}:\\s*\\[${tmvKey},\\s*'([^']*)',\\s*'([^']*)',\\s*'([^']*)'`).exec(daily);
  if (!dailyMatch) throw new Error("Dagwaarde van Maxau ontbreekt.");
  const [, rawPrevious, unit, day] = dailyMatch;
  if (unit !== "cm" || rawPrevious === "--") throw new Error("Dagwaarde van Maxau ontbreekt.");
  const previous = Number(rawPrevious);
  if (!Number.isFinite(previous)) throw new Error("Dagwaarde van Maxau is ongeldig.");
  if (day !== previousDay(updatedAt)) throw new Error("Geen waterstand van de vorige dag.");
  const changeCm = levelCm - Math.round(previous);
  return {
    levelCm,
    changeCm,
    trend: trendFromChange(changeCm),
    status: status.label,
    updatedAt,
  };
}
