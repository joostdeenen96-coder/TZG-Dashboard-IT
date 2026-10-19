import { useEffect, useState } from "react";
import type { DashboardDefinition } from "../types/dashboard";
import { nextBackoff, readPlayerCache, writePlayerCache } from "../player/offlineCache";
import { DashboardCanvas } from "./DisplayPage";

type PlayerPayload = {
  screen: { id: string; name: string; slug: string; location: string };
  dashboard: DashboardDefinition | null;
  message?: string;
  heartbeatIntervalSeconds: number;
  appVersion?: string;
};

type Phase =
  | { kind: "loading" }
  | { kind: "ready"; payload: PlayerPayload; offline: boolean; savedAt: string }
  | { kind: "denied"; message: string }
  | { kind: "unassigned"; message: string }
  | { kind: "unreachable"; message: string };

const denied = "Dit scherm is niet geautoriseerd.";
const unassigned = "Dit scherm is nog niet gekoppeld aan een dashboard.";
const unreachable = "De narrowcastingserver is tijdelijk niet bereikbaar.";

async function readError(response: Response) {
  const payload: unknown = await response.json().catch(() => null);
  if (payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string") {
    return payload.error;
  }
  return denied;
}

function formatSaved(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("nl-NL", { dateStyle: "short", timeStyle: "short" });
}

export function PlayerPage({ token }: { token: string }) {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });

  useEffect(() => {
    let active = true;
    let timer = 0;
    let delay = 2_000;
    let appVersion = "";

    async function heartbeat(payload: PlayerPayload) {
      const response = await fetch("/api/player/heartbeat", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          appVersion: payload.appVersion || appVersion || "web",
          dashboardId: payload.dashboard?.id ?? "",
          status: "ok",
          metadata: { player: "web" },
        }),
      });
      if (!response.ok) throw new Error("heartbeat");
    }

    function schedule(ms: number) {
      timer = window.setTimeout(() => void load(), ms);
    }

    async function load() {
      try {
        const response = await fetch("/api/player/config", {
          headers: { authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (response.status === 401 || response.status === 403) {
          if (!active) return;
          setPhase({ kind: "denied", message: await readError(response) });
          delay = nextBackoff(delay);
          schedule(delay);
          return;
        }
        if (!response.ok) throw new Error("offline");
        const payload = (await response.json()) as PlayerPayload;
        if (!active) return;
        delay = 2_000;
        appVersion = payload.appVersion || appVersion;
        const interval = Math.max(5, payload.heartbeatIntervalSeconds || 60) * 1000;
        if (!payload.dashboard) {
          setPhase({ kind: "unassigned", message: payload.message || unassigned });
          schedule(interval);
          return;
        }
        const savedAt = new Date().toISOString();
        writePlayerCache(token, {
          version: 1,
          savedAt,
          appVersion: payload.appVersion || appVersion || "",
          heartbeatIntervalSeconds: payload.heartbeatIntervalSeconds,
          screen: payload.screen,
          dashboard: payload.dashboard,
        });
        setPhase({ kind: "ready", payload, offline: false, savedAt });
        void heartbeat(payload).catch(() => undefined);
        schedule(interval);
      } catch {
        if (!active) return;
        const cached = readPlayerCache(token);
        if (cached) {
          setPhase({
            kind: "ready",
            payload: {
              screen: cached.screen,
              dashboard: cached.dashboard,
              heartbeatIntervalSeconds: cached.heartbeatIntervalSeconds,
              appVersion: cached.appVersion,
            },
            offline: true,
            savedAt: cached.savedAt,
          });
        } else {
          setPhase({ kind: "unreachable", message: unreachable });
        }
        delay = nextBackoff(delay);
        schedule(delay);
      }
    }

    void load();
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [token]);

  if (phase.kind === "loading") {
    return (
      <div className="fixed inset-0 grid place-items-center bg-ink text-mist">
        <p className="text-[22px]">Scherm laden…</p>
      </div>
    );
  }

  if (phase.kind === "denied" || phase.kind === "unassigned" || phase.kind === "unreachable") {
    return (
      <div className="fixed inset-0 grid place-items-center bg-ink text-paper">
        <div className="px-8 text-center">
          <img src="/teunesen-logo.png" alt="Teunesen" className="mx-auto h-16 w-auto opacity-80" />
          <h1 className="mt-8 font-display text-[48px] font-semibold tracking-[-0.015em]">{phase.message}</h1>
        </div>
      </div>
    );
  }

  return (
    <>
      <DashboardCanvas dashboard={phase.payload.dashboard!} />
      {phase.offline ? (
        <div className="fixed right-6 bottom-6 z-50 rounded-full border border-gold/40 bg-ink/90 px-4 py-2 text-[16px] text-gold">
          Offline — laatste update {formatSaved(phase.savedAt)}
        </div>
      ) : null}
    </>
  );
}
