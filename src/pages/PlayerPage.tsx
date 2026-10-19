import { useEffect, useState } from "react";
import type { DashboardDefinition } from "../types/dashboard";
import { DashboardCanvas } from "./DisplayPage";

type PlayerPayload = {
  screen: { id: string; name: string; slug: string; location: string };
  dashboard: DashboardDefinition | null;
  message?: string;
  heartbeatIntervalSeconds: number;
};

type Phase =
  | { kind: "loading" }
  | { kind: "ready"; payload: PlayerPayload; offline: boolean }
  | { kind: "denied"; message: string }
  | { kind: "unassigned"; message: string };

const denied = "Dit scherm is niet geautoriseerd.";
const unassigned = "Dit scherm is nog niet gekoppeld aan een dashboard.";

function cacheKey(token: string) {
  return `tzg-player-config:${token}`;
}

function readCache(token: string): PlayerPayload | null {
  try {
    const raw = localStorage.getItem(cacheKey(token));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PlayerPayload;
    if (!parsed?.dashboard) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(token: string, payload: PlayerPayload) {
  if (!payload.dashboard) return;
  localStorage.setItem(cacheKey(token), JSON.stringify(payload));
}

async function readError(response: Response) {
  const payload: unknown = await response.json().catch(() => null);
  if (payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string") {
    return payload.error;
  }
  return denied;
}

export function PlayerPage({ token }: { token: string }) {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });

  useEffect(() => {
    let active = true;
    let timer = 0;
    let delay = 2_000;

    async function heartbeat(payload: PlayerPayload) {
      await fetch("/api/player/heartbeat", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          appVersion: "web",
          dashboardId: payload.dashboard?.id ?? "",
          status: "ok",
          metadata: { player: "web" },
        }),
      });
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
          schedule(Math.min(delay * 2, 60_000));
          delay = Math.min(delay * 2, 60_000);
          return;
        }
        if (!response.ok) throw new Error("offline");
        const payload = (await response.json()) as PlayerPayload;
        if (!active) return;
        delay = 2_000;
        const interval = Math.max(5, payload.heartbeatIntervalSeconds || 60) * 1000;
        if (!payload.dashboard) {
          setPhase({ kind: "unassigned", message: payload.message || unassigned });
          schedule(interval);
          return;
        }
        writeCache(token, payload);
        setPhase({ kind: "ready", payload, offline: false });
        void heartbeat(payload).catch(() => undefined);
        schedule(interval);
      } catch {
        if (!active) return;
        const cached = readCache(token);
        if (cached) setPhase({ kind: "ready", payload: cached, offline: true });
        else setPhase({ kind: "denied", message: "Verbinding met het scherm mislukt." });
        delay = Math.min(delay * 2, 60_000);
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

  if (phase.kind === "denied" || phase.kind === "unassigned") {
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
          Offline — laatste configuratie
        </div>
      ) : null}
    </>
  );
}
