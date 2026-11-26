import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { alarmCounts, openAlarms, percentLabel, primaryVolume } from "../../src/lib/serverBoard.ts";
import { retainPrtgOnFailure, type PrtgResponse } from "../services/prtgService.ts";
import type { PrtgAlarm, PrtgMetric } from "../../src/types/index.ts";

const root = path.resolve(import.meta.dirname, "../..");

function read(relative: string) {
  return readFileSync(path.join(root, relative), "utf8");
}

function metric(name: string, percent: number | null): PrtgMetric {
  return { sensorId: name, name, percent, status: percent === null ? "unknown" : "up", high: false };
}

function alarm(partial: Partial<PrtgAlarm> & Pick<PrtgAlarm, "id" | "status">): PrtgAlarm {
  return {
    device: "srv-01.teunesen.local",
    sensor: "CPU",
    message: "hoog",
    acknowledged: false,
    group: "Servers",
    lastvalue: "90 %",
    sinceLabel: "5 min",
    sinceAt: "2026-11-26T07:00:00Z",
    suggestion: null,
    ...partial,
  };
}

test("onbekende metrics worden niet 0 en de volste schijf wint", () => {
  assert.equal(percentLabel(null), "Onbekend");
  assert.equal(percentLabel(Number.NaN), "Onbekend");
  assert.equal(percentLabel(0), "0%");
  const disk = primaryVolume([
    metric("C:", 40),
    metric("D:", null),
    metric("E:", 91),
  ]);
  assert.equal(disk?.name, "E:");
  assert.equal(primaryVolume([metric("C:", null)])?.name, "C:");
});

test("storing en waarschuwing blijven uit elkaar; bevestigd en een andere server niet", () => {
  const alarms = [
    alarm({ id: "1", status: "warning", sinceAt: "2026-11-26T08:00:00Z" }),
    alarm({ id: "2", status: "down", message: "<img src=x onerror=alert(1)> schijf vol", sinceAt: "2026-11-26T06:00:00Z" }),
    alarm({ id: "3", status: "downAcknowledged", acknowledged: true }),
    alarm({ id: "4", status: "down", device: "andere-host" }),
  ];
  const open = openAlarms(alarms, "SRV-01");
  assert.deepEqual(open.map((item) => item.id), ["2", "1"]);
  assert.equal(open[0]?.message.includes("<img"), true);
  const counts = alarmCounts(open);
  assert.equal(counts.errors, 1);
  assert.equal(counts.warnings, 1);
});

test("een mislukte refresh houdt de laatste servers en de volgende succes wist de fout", () => {
  const last: PrtgResponse = {
    connected: true,
    configured: true,
    filterReady: true,
    source: "PRTG",
    fetchedAt: "2026-11-26T07:00:00.000Z",
    error: null,
    alarms: [],
    servers: [{ id: "1", name: "srv", cpu: metric("CPU", 12), memory: null, storage: [] }],
  };
  const stale = retainPrtgOnFailure(last, "PRTG niet bereikbaar.");
  assert.equal(stale.servers[0]?.cpu?.percent, 12);
  assert.equal(stale.fetchedAt, last.fetchedAt);
  assert.equal(stale.error, "PRTG niet bereikbaar.");
  const recovered = { ...stale, error: null, fetchedAt: "2026-11-26T07:01:00.000Z" };
  assert.equal(recovered.error, null);
  assert.equal(retainPrtgOnFailure(null, "weg").servers.length, 0);
});

test("overzicht en resources delen de PRTG-feed en wisselen zonder tweede poll", () => {
  const panel = read("src/components/PrtgServersPanel.tsx");
  const board = read("src/components/ServerResourceBoard.tsx");
  const page = read("src/pages/IctDashboardPage.tsx");
  const feed = read("src/services/prtgService.ts");
  const tv = read("src/services/tvFeed.ts");
  const service = read("server/services/prtgService.ts");
  assert.match(panel, /data-server-view-tab="overview"/);
  assert.match(panel, /data-server-view-tab="resources"/);
  assert.match(panel, /min-h-11/);
  assert.equal(panel.includes("usePrtg"), false);
  assert.equal(panel.includes("fetch("), false);
  assert.equal(board.includes("startServerResourcePoll"), false);
  assert.equal(board.includes("fetch("), false);
  assert.equal(board.includes("dangerouslySetInnerHTML"), false);
  assert.match(board, /data-server-resources/);
  assert.equal(board.includes("transform:"), false);
  assert.match(read("src/index.css"), /grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(read("src/index.css"), /grid-template-rows:\s*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(read("src/index.css"), /\[data-server-resources\][\s\S]*overflow:\s*hidden/);
  assert.match(page, /usePrtg\(\)/);
  assert.equal(page.match(/usePrtg\(\)/g)?.length, 1);
  assert.match(feed, /PRTG_REFRESH_MS = 60_000/);
  assert.match(feed, /pauseWhenHidden: true/);
  assert.match(tv, /if \(inFlight\) return/);
  assert.match(tv, /pauseWhenHidden && document.visibilityState === "hidden"/);
  assert.match(service, /const REFRESH_MS = 60_000/);
  assert.match(service, /if \(inFlight\) return inFlight/);
});

test("gepauzeerde sensoren zijn geen alarm in het resourcemodel", () => {
  const model = read("server/prtg/resourceModel.ts");
  const start = model.indexOf("function isAlert");
  const body = model.slice(start, model.indexOf("}", start));
  assert.equal(body.includes("paused"), false);
  assert.match(body, /warning/);
  assert.match(body, /down/);
});
