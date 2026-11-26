/**
 * Dagelijkse ochtendcontrole van de gasolietoeslag.
 * Tijdstip in Europe/Amsterdam, standaard 06:00. Meerdere processen claimen één bestand per dag.
 */
import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { dataDir } from "../appPaths.js";
import { logInfo, logWarn } from "../log.js";
import { amsterdamCalendarDate } from "./monthLogic.js";
import { runNetherlandsDailyCapture } from "./dailyCapture.js";

export type MorningClock = { hour: number; minute: number };

const DEFAULT_CLOCK: MorningClock = { hour: 6, minute: 0 };

export function parseMorningClock(raw: string | undefined): MorningClock | null {
  const value = (raw ?? "06:00").trim().toLowerCase();
  if (value === "off" || value === "0" || value === "false") return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return DEFAULT_CLOCK;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return DEFAULT_CLOCK;
  return { hour, minute };
}

function amsterdamWall(now: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Amsterdam",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  const hour = Number(parts.hour);
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: hour === 24 ? 0 : hour,
    minute: Number(parts.minute),
  };
}

function offsetMinutes(instant: Date) {
  const name =
    new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Amsterdam", timeZoneName: "shortOffset" })
      .formatToParts(instant)
      .find((part) => part.type === "timeZoneName")?.value ?? "GMT+1";
  const match = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(name);
  if (!match) return 60;
  const sign = match[1] === "-" ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3] ?? 0));
}

/** Muurtijd Europe/Amsterdam naar UTC. 06:00 valt buiten de zomer- en wintertijdssprong. */
export function amsterdamDateTimeToUtc(year: number, month: number, day: number, hour: number, minute: number) {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const first = offsetMinutes(guess);
  const utc = new Date(guess.getTime() - first * 60_000);
  const second = offsetMinutes(utc);
  return second === first ? utc : new Date(guess.getTime() - second * 60_000);
}

function addCalendarDays(year: number, month: number, day: number, delta: number) {
  const cursor = new Date(Date.UTC(year, month - 1, day + delta));
  return { year: cursor.getUTCFullYear(), month: cursor.getUTCMonth() + 1, day: cursor.getUTCDate() };
}

/** Volgende 06:00 (of ander tijdstip). Op het tijdstip zelf is de volgende dag aan de beurt. */
export function nextMorningCheck(now: Date, clock: MorningClock) {
  const wall = amsterdamWall(now);
  const before = wall.hour < clock.hour || (wall.hour === clock.hour && wall.minute < clock.minute);
  const target = before ? wall : addCalendarDays(wall.year, wall.month, wall.day, 1);
  return amsterdamDateTimeToUtc(target.year, target.month, target.day, clock.hour, clock.minute);
}

function lockPath(dateKey: string) {
  return path.join(dataDir(), `gasoil-morning-${dateKey}.lock`);
}

/** Eén proces per Amsterdam-dag. `false` betekent dat een andere instantie de controle al heeft. */
export function claimMorningRun(dateKey: string) {
  mkdirSync(dataDir(), { recursive: true });
  try {
    writeFileSync(lockPath(dateKey), new Date().toISOString(), { flag: "wx" });
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  }
}

export function releaseMorningRun(dateKey: string) {
  try {
    unlinkSync(lockPath(dateKey));
  } catch {
    // Het slot ontbreekt al.
  }
}

let started = false;

export function resetMorningCheckForTests() {
  started = false;
}

/**
 * Plant de ochtendcontrole. Geen browservenster. Een mislukte bron laat de bestaande maandcache staan;
 * het slot gaat dan weg zodat een herstart dezelfde ochtend opnieuw mag proberen.
 */
export function startGasOilMorningCheck(run: () => Promise<unknown> = runNetherlandsDailyCapture) {
  if (started) return;
  if (process.env.GASOIL_CAPTURE_ENABLED === "0") return;
  const clock = parseMorningClock(process.env.GASOIL_MORNING_CHECK);
  if (!clock) {
    logInfo("gasoil ochtendcontrole uitgeschakeld", { event: "gasoil.morning.skipped" });
    return;
  }
  started = true;
  logInfo("gasoil ochtendcontrole gepland", {
    event: "gasoil.morning.scheduled",
    time: `${String(clock.hour).padStart(2, "0")}:${String(clock.minute).padStart(2, "0")}`,
    timeZone: "Europe/Amsterdam",
  });

  const tick = () => {
    const today = amsterdamCalendarDate();
    const claimed = claimMorningRun(today);
    const finish = () => {
      const delay = Math.max(1_000, nextMorningCheck(new Date(), clock).getTime() - Date.now());
      setTimeout(tick, delay).unref?.();
    };
    if (!claimed) {
      finish();
      return;
    }
    void run()
      .then((result) => {
        const failed = result && typeof result === "object" && "status" in result && result.status === "failed";
        if (failed) {
          releaseMorningRun(today);
          logWarn("gasoil ochtendcontrole mislukt, laatst geldige toeslag blijft staan", {
            event: "gasoil.morning.failed",
          });
        } else {
          logInfo("gasoil ochtendcontrole klaar", { event: "gasoil.morning.done", date: today });
        }
      })
      .catch((error: unknown) => {
        releaseMorningRun(today);
        const reason = error instanceof Error ? error.message : "onbekend";
        logWarn(`gasoil ochtendcontrole mislukt: ${reason}`, { event: "gasoil.morning.failed" });
      })
      .finally(finish);
  };

  const wall = amsterdamWall(new Date());
  const due = wall.hour > clock.hour || (wall.hour === clock.hour && wall.minute >= clock.minute);
  if (due) {
    tick();
    return;
  }
  const delay = Math.max(1_000, nextMorningCheck(new Date(), clock).getTime() - Date.now());
  setTimeout(tick, delay).unref?.();
}
