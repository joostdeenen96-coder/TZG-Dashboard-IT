/**
 * Dagelijkse ochtendcontrole van de gasolietoeslag.
 * Tijdstip in Europe/Amsterdam, standaard 06:00. Meerdere processen claimen één bestand per dag.
 */
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { dataDir } from "../appPaths.js";
import { logInfo, logWarn } from "../log.js";
import { runGasOilCheck, type GasOilCheckReport } from "./check.js";
import { amsterdamCalendarDate } from "./monthLogic.js";

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

const STALE_RUN_MS = 15 * 60_000;

export type MorningRunStatus = "none" | "started" | "success";

function lockPath(dateKey: string) {
  return path.join(dataDir(), `gasoil-morning-${dateKey}.lock`);
}

function lockText(dateKey: string) {
  try {
    return readFileSync(lockPath(dateKey), "utf8");
  } catch {
    return null;
  }
}

function lockStamp(text: string) {
  const stamp = Date.parse(text.replace(/^(started|success)\s+/, "").trim());
  return Number.isFinite(stamp) ? stamp : null;
}

export function morningRunStatus(dateKey: string): MorningRunStatus {
  const text = lockText(dateKey);
  if (text === null) return "none";
  if (text.startsWith("success")) return "success";
  return "started";
}

/**
 * Eén proces per Amsterdam-dag. Een succes blijft staan.
 * Een vastgelopen start ouder dan een kwartier mag opnieuw.
 */
export function claimMorningRun(dateKey: string, now = new Date(), options: { reclaimStarted?: boolean } = {}) {
  mkdirSync(dataDir(), { recursive: true });
  const file = lockPath(dateKey);
  const body = `started ${now.toISOString()}`;
  try {
    writeFileSync(file, body, { flag: "wx" });
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  const text = lockText(dateKey) ?? "";
  if (text.startsWith("success")) return false;
  const stamp = lockStamp(text);
  const fresh = stamp !== null && now.getTime() - stamp < STALE_RUN_MS;
  if (fresh && !options.reclaimStarted) return false;
  writeFileSync(file, body);
  return true;
}

export function completeMorningRun(dateKey: string, now = new Date()) {
  mkdirSync(dataDir(), { recursive: true });
  writeFileSync(lockPath(dateKey), `success ${now.toISOString()}`);
}

export function releaseMorningRun(dateKey: string) {
  try {
    unlinkSync(lockPath(dateKey));
  } catch {
    // Het slot ontbreekt al.
  }
}

/** Na 06:00 draait de controle als vandaag nog niet succesvol is afgerond. */
export function shouldRunMorningCheckNow(now: Date, clock: MorningClock, status: MorningRunStatus) {
  const wall = amsterdamWall(now);
  const before = wall.hour < clock.hour || (wall.hour === clock.hour && wall.minute < clock.minute);
  if (before) return false;
  return status !== "success";
}

/** Een mislukte controle probeert dezelfde dag opnieuw, met het bestaande capture-interval als bovengrens. */
export function nextGasOilCheckDelay(now: Date, clock: MorningClock, failed: boolean, intervalMs = 6 * 60 * 60 * 1000) {
  const untilMorning = Math.max(1_000, nextMorningCheck(now, clock).getTime() - now.getTime());
  if (!failed) return untilMorning;
  const retry = Number.isFinite(intervalMs) && intervalMs >= 60_000 ? intervalMs : 6 * 60 * 60 * 1000;
  return Math.max(1_000, Math.min(untilMorning, retry));
}

let started = false;

export function resetMorningCheckForTests() {
  started = false;
}

function captureIntervalMs() {
  const intervalMs = Number(process.env.GASOIL_CAPTURE_INTERVAL_MS || 6 * 60 * 60 * 1000);
  return Number.isFinite(intervalMs) && intervalMs >= 60_000 ? intervalMs : 6 * 60 * 60 * 1000;
}

/**
 * Plant de ochtendcontrole. Die roept dezelfde gasolieservice aan als de API.
 * Alleen een geslaagde run blijft als slot staan. Een storing wordt dezelfde ochtend opnieuw geprobeerd.
 */
export function startGasOilMorningCheck(run: () => Promise<GasOilCheckReport> = runGasOilCheck) {
  if (started) return;
  if (process.env.GASOIL_CAPTURE_ENABLED === "0") return;
  const clock = parseMorningClock(process.env.GASOIL_MORNING_CHECK);
  if (!clock) {
    logInfo("gasoil morning check scheduled", { event: "gasoil.morning.skipped", enabled: false });
    return;
  }
  started = true;
  const startedAt = new Date();
  const dueNow = shouldRunMorningCheckNow(startedAt, clock, morningRunStatus(amsterdamCalendarDate(startedAt)));
  logInfo("gasoil morning check scheduled", {
    event: "gasoil.morning.scheduled",
    time: `${String(clock.hour).padStart(2, "0")}:${String(clock.minute).padStart(2, "0")}`,
    timeZone: "Europe/Amsterdam",
    scheduledAt: (dueNow ? startedAt : nextMorningCheck(startedAt, clock)).toISOString(),
  });

  let reclaimOnNextClaim = true;
  const tick = () => {
    const now = new Date();
    const today = amsterdamCalendarDate(now);
    const status = morningRunStatus(today);
    if (!shouldRunMorningCheckNow(now, clock, status)) {
      const delay = nextGasOilCheckDelay(now, clock, false, captureIntervalMs());
      setTimeout(tick, delay).unref?.();
      return;
    }
    const reclaimStarted = reclaimOnNextClaim;
    reclaimOnNextClaim = false;
    if (!claimMorningRun(today, now, { reclaimStarted })) {
      const delay = nextGasOilCheckDelay(now, clock, morningRunStatus(today) !== "success", captureIntervalMs());
      setTimeout(tick, delay).unref?.();
      return;
    }
    logInfo("gasoil morning check started", { event: "gasoil.morning.started", date: today });
    void run()
      .then((result) => {
        if (result.status === "failed") {
          releaseMorningRun(today);
          logWarn("gasoil morning check failed", { event: "gasoil.morning.failed", date: today });
          return false;
        }
        completeMorningRun(today);
        logInfo("gasoil check completed", { event: "gasoil.morning.done", date: today, status: "success" });
        return true;
      })
      .catch((error: unknown) => {
        releaseMorningRun(today);
        const reason = error instanceof Error ? error.message : "onbekend";
        logWarn(`gasoil morning check failed: ${reason}`, { event: "gasoil.morning.failed" });
        return false;
      })
      .then((ok) => {
        const delay = nextGasOilCheckDelay(new Date(), clock, ok === false, captureIntervalMs());
        setTimeout(tick, delay).unref?.();
      });
  };

  if (shouldRunMorningCheckNow(new Date(), clock, morningRunStatus(amsterdamCalendarDate()))) {
    tick();
    return;
  }
  const delay = nextGasOilCheckDelay(new Date(), clock, false, captureIntervalMs());
  setTimeout(tick, delay).unref?.();
}
