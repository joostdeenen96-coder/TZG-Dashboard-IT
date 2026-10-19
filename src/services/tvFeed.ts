import type { QueryState } from "../types";
import { getRefreshMs } from "./dashboardConfigService";
import { tvLog } from "./tvLog";

export const TV_REFRESH_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 45_000;
const RETRY_MS = [5_000, 15_000, 30_000, 60_000];

type FeedOptions<T> = {
  name: string;
  storageKey: string;
  unavailable: string;
  load: (signal: AbortSignal) => Promise<T | "empty">;
  accept: (value: unknown) => T | null;
  refreshMs?: number;
};

function refreshDelay(overrideMs?: number) {
  if (typeof overrideMs === "number" && Number.isFinite(overrideMs) && overrideMs >= 15_000 && overrideMs <= 3_600_000) {
    return overrideMs;
  }
  const configured = getRefreshMs();
  if (!Number.isFinite(configured) || configured < 15_000 || configured > 3_600_000) return TV_REFRESH_MS;
  return configured;
}

function failureMessage(error: unknown, fallback: string) {
  if (error instanceof DOMException && error.name === "AbortError") return "Verbinding duurde te lang.";
  if (!(error instanceof Error) || !error.message.trim()) return fallback;
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(error.message)) return fallback;
  return error.message;
}

export function createPollingFeed<T>(options: FeedOptions<T>) {
  const listeners = new Set<() => void>();
  let snapshot: QueryState<T> = { status: "loading", refreshing: true, fetchedAt: null };
  let timer = 0;
  let inFlight = false;
  let failures = 0;
  let nextAt = 0;
  let lastSuccessAt = 0;
  let cached: { fetchedAt: string; data: T } | null = null;

  function emit() {
    for (const listener of listeners) {
      try {
        listener();
      } catch (error) {
        tvLog("error", options.name, failureMessage(error, "Luisteraar faalde."));
      }
    }
  }

  function publish(next: QueryState<T>) {
    snapshot = next;
    emit();
  }

  function markRefreshing() {
    if (snapshot.refreshing) return;
    if (snapshot.status === "loading") publish({ status: "loading", refreshing: true, fetchedAt: snapshot.fetchedAt });
    else if (snapshot.status === "error") {
      publish({ status: "error", message: snapshot.message, refreshing: true, fetchedAt: snapshot.fetchedAt });
    } else if (snapshot.status === "empty") publish({ status: "empty", refreshing: true, fetchedAt: snapshot.fetchedAt });
    else if (snapshot.status === "ready") {
      publish({ status: "ready", data: snapshot.data, refreshing: true, fetchedAt: snapshot.fetchedAt });
    } else {
      publish({
        status: "fallback",
        data: snapshot.data,
        message: snapshot.message,
        refreshing: true,
        fetchedAt: snapshot.fetchedAt,
      });
    }
  }

  function remember(data: T, fetchedAt: string) {
    cached = { data, fetchedAt };
    try {
      localStorage.setItem(options.storageKey, JSON.stringify(cached));
    } catch {
      tvLog("warn", options.name, "Opslaan van laatste gegevens mislukt.");
    }
  }

  function forget() {
    cached = null;
    try {
      localStorage.removeItem(options.storageKey);
    } catch {
      tvLog("warn", options.name, "Wissen van laatste gegevens mislukt.");
    }
  }

  function restore() {
    try {
      const raw = localStorage.getItem(options.storageKey);
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return;
      const row = parsed as Record<string, unknown>;
      if (typeof row.fetchedAt !== "string") return;
      const data = options.accept(row.data);
      if (!data) return;
      cached = { fetchedAt: row.fetchedAt, data };
      publish({
        status: "fallback",
        data,
        message: "Laatste bekende gegevens.",
        refreshing: true,
        fetchedAt: row.fetchedAt,
      });
      tvLog("info", options.name, "Laatste bekende gegevens geladen.");
    } catch {
      tvLog("warn", options.name, "Opgeslagen gegevens onbruikbaar.");
    }
  }

  function hold(message: string) {
    if (cached) {
      publish({
        status: "fallback",
        data: cached.data,
        message: "Laatste bekende gegevens.",
        refreshing: false,
        fetchedAt: cached.fetchedAt,
      });
      return;
    }
    publish({ status: "error", message, refreshing: false, fetchedAt: null });
  }

  function schedule(delay: number) {
    window.clearTimeout(timer);
    nextAt = Date.now() + delay;
    timer = window.setTimeout(() => {
      void run();
    }, delay);
  }

  async function run() {
    if (inFlight) return;
    inFlight = true;
    const started = Date.now();
    markRefreshing();
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const result = await options.load(controller.signal);
      failures = 0;
      lastSuccessAt = Date.now();
      const fetchedAt = new Date().toISOString();
      if (result === "empty") {
        forget();
        publish({ status: "empty", refreshing: false, fetchedAt });
        tvLog("info", options.name, `leeg in ${Date.now() - started} ms`);
      } else {
        remember(result, fetchedAt);
        publish({ status: "ready", data: result, refreshing: false, fetchedAt });
        tvLog("info", options.name, `bijgewerkt in ${Date.now() - started} ms`);
      }
      const delay = refreshDelay(options.refreshMs);
      schedule(delay);
      tvLog("info", options.name, `volgende verversing over ${Math.round(delay / 1000)} s`);
    } catch (error) {
      failures += 1;
      const message = failureMessage(error, options.unavailable);
      const delay = RETRY_MS[Math.min(failures - 1, RETRY_MS.length - 1)] ?? 60_000;
      hold(message);
      tvLog(
        "warn",
        options.name,
        cached
          ? `${message} Laatste gegevens blijven staan. Nieuwe poging over ${Math.round(delay / 1000)} s.`
          : `${message} Nieuwe poging over ${Math.round(delay / 1000)} s.`,
      );
      schedule(delay);
    } finally {
      window.clearTimeout(timeout);
      inFlight = false;
    }
  }

  function kick(reason: string) {
    if (inFlight) return;
    tvLog("info", options.name, reason);
    window.clearTimeout(timer);
    void run();
  }

  restore();
  tvLog("info", options.name, `verversing elke ${Math.round(refreshDelay(options.refreshMs) / 1000)} seconden`);
  void run();

  window.addEventListener("online", () => kick("Netwerk terug. Opnieuw ophalen."));
  window.addEventListener("offline", () => {
    tvLog("warn", options.name, "Geen netwerk.");
    if (cached) hold("Laatste bekende gegevens.");
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (Date.now() - lastSuccessAt >= refreshDelay(options.refreshMs)) kick("Scherm weer zichtbaar. Opnieuw ophalen.");
  });
  window.setInterval(() => {
    if (inFlight || nextAt === 0) return;
    if (Date.now() > nextAt + 5_000) {
      tvLog("warn", options.name, "Verversing te laat. Opnieuw starten.");
      void run();
    }
  }, 30_000);

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot() {
      return snapshot;
    },
  };
}
