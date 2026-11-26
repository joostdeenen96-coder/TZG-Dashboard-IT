import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  compactVolumeName,
  getServerPriority,
  primaryVolume,
  sortServersByPriority,
  visibleResourceCards,
} from "../../src/lib/serverBoard.ts";
import type { PrtgAlarm, PrtgMetric, PrtgServer } from "../../src/types/index.ts";

const root = path.resolve(import.meta.dirname, "../..");

function read(relative: string) {
  return readFileSync(path.join(root, relative), "utf8");
}

function metric(name: string, percent: number | null, status: PrtgMetric["status"] = "up", high = false): PrtgMetric {
  return { sensorId: name, name, percent, status, high };
}

function server(id: string, partial: Partial<PrtgServer> = {}): PrtgServer {
  return {
    id,
    name: id,
    cpu: metric("CPU", 20),
    memory: metric("Geheugen", 40),
    storage: [metric("Disk Free: C:\\ Label:Windows Serial Number AB12", 30)],
    ...partial,
  };
}

function alarm(partial: Partial<PrtgAlarm> & Pick<PrtgAlarm, "id" | "device" | "status">): PrtgAlarm {
  return {
    sensor: "SSL Certificate",
    message: "SSL-certificaat verloopt binnenkort",
    acknowledged: false,
    group: "Servers",
    lastvalue: "",
    sinceLabel: "1 u",
    sinceAt: "2026-11-26T08:00:00Z",
    suggestion: null,
    ...partial,
  };
}

test("SORT1 Down staat vooraan", () => {
  const servers = [server("normaal"), server("down", { cpu: metric("CPU", 10, "down") })];
  assert.deepEqual(
    sortServersByPriority(servers, []).map((item) => item.id),
    ["down", "normaal"],
  );
  assert.equal(getServerPriority(servers[1]!, []), 0);
});

test("SORT2 Error staat vooraan", () => {
  const servers = [server("normaal"), server("error", { memory: metric("Geheugen", 10, "downPartial") })];
  assert.equal(sortServersByPriority(servers, [])[0]?.id, "error");
  assert.equal(getServerPriority(servers[1]!, []), 0);
});

test("SORT3 resource-Warning komt na Down", () => {
  const servers = [
    server("opslag", { storage: [metric("C:", 86, "warning")] }),
    server("cpu-down", { cpu: metric("CPU", 99, "down") }),
  ];
  assert.deepEqual(
    sortServersByPriority(servers, []).map((item) => item.id),
    ["cpu-down", "opslag"],
  );
});

test("SORT4 geheugen-Warning staat voor een normale server", () => {
  const servers = [
    server("normaal"),
    server("TEUHESWRGW01", { memory: metric("Geheugen", 80, "warning") }),
  ];
  assert.equal(sortServersByPriority(servers, [])[0]?.id, "TEUHESWRGW01");
  assert.equal(getServerPriority(servers[1]!, []), 1);
});

test("SORT5 opslag-Warning staat voor een normale server", () => {
  const servers = [
    server("normaal"),
    server("TEUHESWAPP01", { storage: [metric("Disk Free: C:\\ Label:Windows Serial Number ZZ", 86, "warning")] }),
  ];
  assert.equal(sortServersByPriority(servers, [])[0]?.id, "TEUHESWAPP01");
});

test("SORT6 CPU-Warning staat voor een normale server", () => {
  const servers = [server("normaal"), server("cpu", { cpu: metric("CPU", 70, "warning") })];
  assert.equal(sortServersByPriority(servers, [])[0]?.id, "cpu");
  assert.equal(getServerPriority(servers[1]!, []), 1);
});

test("SORT7 een andere Warning komt na een resource-Warning", () => {
  const servers = [server("ssl"), server("geheugen", { memory: metric("Geheugen", 80, "warning") })];
  const alarms = [alarm({ id: "ssl", device: "ssl", status: "warning" })];
  assert.deepEqual(
    sortServersByPriority(servers, alarms).map((item) => item.id),
    ["geheugen", "ssl"],
  );
  assert.equal(getServerPriority(servers[0]!, alarms), 2);
});

test("SORT8 Unusual komt na Warning", () => {
  const servers = [server("afwijkend", { cpu: metric("CPU", 10, "unusual") }), server("ssl")];
  const alarms = [alarm({ id: "ssl", device: "ssl", status: "warning" })];
  assert.deepEqual(
    sortServersByPriority(servers, alarms).map((item) => item.id),
    ["ssl", "afwijkend"],
  );
  assert.equal(getServerPriority(servers[0]!, []), 3);
});

test("SORT9 een normale server staat onderaan", () => {
  const servers = [
    server("normaal"),
    server("down", { cpu: metric("CPU", 1, "down") }),
    server("resource", { memory: metric("Geheugen", 80, "warning") }),
    server("overig"),
    server("afwijkend", { cpu: metric("CPU", 5, "unusual") }),
  ];
  const alarms = [alarm({ id: "overig", device: "overig", status: "warning" })];
  assert.deepEqual(
    sortServersByPriority(servers, alarms).map((item) => item.id),
    ["down", "resource", "overig", "afwijkend", "normaal"],
  );
});

test("SORT10 gepauzeerd en een hoog percentage zonder Warning zijn geen waarschuwing", () => {
  const busy = server("druk", {
    memory: metric("Geheugen", 92, "up", true),
    storage: [metric("C:", 90, "up", true)],
  });
  const acknowledged = server("bevestigd");
  const alarms = [
    alarm({ id: "ack", device: "bevestigd", status: "down", acknowledged: true }),
    alarm({ id: "ack2", device: "bevestigd", status: "downAcknowledged", acknowledged: true }),
  ];
  assert.equal(getServerPriority(busy, []), 4);
  assert.equal(getServerPriority(acknowledged, alarms), 4);
  const model = read("server/prtg/resourceModel.ts");
  const start = model.indexOf("function isAlert");
  const body = model.slice(start, model.indexOf("}", start));
  assert.equal(body.includes("paused"), false);
});

test("SORT11 gelijke prioriteit houdt de oorspronkelijke volgorde", () => {
  const servers = [server("zulu"), server("alpha"), server("midden", { memory: metric("Geheugen", 81, "warning") }), server("nova")];
  assert.deepEqual(
    sortServersByPriority(servers, []).map((item) => item.id),
    ["midden", "zulu", "alpha", "nova"],
  );
});

test("SORT12 een refresh met een nieuwe Warning zet de server naar voren", () => {
  const before = [server("eerste"), server("tweede"), server("derde")];
  assert.deepEqual(
    sortServersByPriority(before, []).map((item) => item.id),
    ["eerste", "tweede", "derde"],
  );
  const after = [
    before[0]!,
    before[1]!,
    server("derde", { storage: [metric("C:", 86, "warning")] }),
  ];
  assert.deepEqual(
    sortServersByPriority(after, []).map((item) => item.id),
    ["derde", "eerste", "tweede"],
  );
});

test("SORT13 herstel zet de server terug op de oorspronkelijke plek", () => {
  const recovered = [server("eerste"), server("tweede"), server("derde", { storage: [metric("C:", 40, "up")] })];
  assert.deepEqual(
    sortServersByPriority(recovered, []).map((item) => item.id),
    ["eerste", "tweede", "derde"],
  );
});

test("SORT14 de popup blijft aan dezelfde serverId hangen na herschikken", () => {
  const panel = read("src/components/PrtgServersPanel.tsx");
  assert.match(panel, /key=\{selected\.server\.id\}/);
  assert.match(panel, /serverId=\{selected\.server\.id\}/);
  assert.equal(panel.includes("selectedIndex"), false);
  const before = [server("a"), server("b")];
  const selectedId = before[1]!.id;
  const after = [server("a"), server("b", { cpu: metric("CPU", 4, "down") })];
  const ordered = sortServersByPriority(after, []);
  assert.equal(ordered[0]?.id, "b");
  assert.equal(ordered.find((item) => item.id === selectedId)?.id, selectedId);
});

test("een onbekende metric is geen 0 en geeft geen prioriteit", () => {
  const unknown = server("leeg", { cpu: metric("CPU", null, "unknown"), memory: null, storage: [] });
  assert.equal(getServerPriority(unknown, []), 4);
  assert.equal(primaryVolume([metric("C:", null, "unknown"), metric("D:", 10, "up")])?.name, "D:");
});

test("LAY1 tot LAY12 de compacte kaart toont de kern en verbergt de lange schijftekst", () => {
  const board = read("src/components/ServerResourceBoard.tsx");
  const dialog = read("src/components/ServerResourceDialog.tsx");
  const css = read("src/index.css");
  for (const label of ["CPU", "Geheugen", "Opslag"]) {
    assert.match(board, new RegExp(`label="${label}"`));
  }
  assert.match(board, /data-server-status/);
  assert.match(board, /data-server-updated/);
  assert.match(board, /data-server-incidents/);
  assert.match(board, /data-server-details/);
  assert.match(board, /compactVolumeName/);
  assert.match(board, /truncate/);
  assert.match(board, /data-gauge-hint/);
  assert.equal(board.includes("Serial Number"), false);
  assert.equal(board.includes("Laatste update"), false);
  assert.match(css, /text-overflow:\s*ellipsis/);
  const warnings = dialog.slice(dialog.indexOf('title="Waarschuwingen"'));
  assert.match(warnings, /alert\.message/);
  assert.equal(warnings.slice(0, warnings.indexOf("</Section>")).includes("truncate"), false);
  assert.equal(compactVolumeName("Disk Free: C:\\ Label:Windows Serial Number AB12"), "C:");
  assert.equal(compactVolumeName("Disk Free: D:\\"), "D:");
  const warningDisk = primaryVolume([
    metric("Disk Free: C:\\ Label:Windows Serial Number 1", 40, "up"),
    metric("Disk Free: E:\\ Label:Data Serial Number 2", 86, "warning"),
  ]);
  assert.equal(warningDisk?.name.includes("E:"), true);
  assert.equal(compactVolumeName(warningDisk?.name ?? ""), "E:");
});

test("LAY13 1920x1080 toont minstens zes resourcekaarten", () => {
  const fit = visibleResourceCards(1920, 1080);
  assert.equal(fit.columns, 3);
  assert.ok(fit.visible >= 6, `zichtbaar ${fit.visible}`);
});

test("LAY14 2560x1440 houdt minstens de dichtheid van 1080p", () => {
  const desktop = visibleResourceCards(1920, 1080);
  const wide = visibleResourceCards(2560, 1440);
  assert.ok(wide.columns >= 3);
  assert.ok(wide.visible >= desktop.visible);
});

test("LAY15 3840x2160 toont meer kaarten en begrensde meters", () => {
  const wide = visibleResourceCards(2560, 1440);
  const fourk = visibleResourceCards(3840, 2160);
  assert.equal(fourk.columns, 4);
  assert.ok(fourk.visible > wide.visible);
  const css = read("src/index.css");
  const resourceCss = css.slice(css.indexOf("/* Resourcekaarten"), css.indexOf(".dashboard-detail-overlay"));
  assert.match(resourceCss, /@media \(min-width: 3000px\)/);
  assert.match(resourceCss, /clamp\(60px, 3\.2vw, 64px\)/);
  assert.equal(/(?<![a-z-])transform\s*:/.test(resourceCss), false);
});

test("LAY16 en LAY17 het serverblok scrolt intern en de pagina niet", () => {
  const page = read("src/pages/IctDashboardPage.tsx");
  const panel = read("src/components/PrtgServersPanel.tsx");
  const board = read("src/components/ServerResourceBoard.tsx");
  const css = read("src/index.css");
  assert.match(page, /overflow-hidden/);
  assert.match(panel, /overflow-hidden/);
  assert.match(board, /server-resources-scroll/);
  assert.match(css, /\[data-server-resources\][\s\S]*overflow:\s*auto/);
  assert.match(css, /scrollbar-width:\s*thin/);
  assert.match(panel, /sortServersByPriority/);
  assert.match(panel, /servers=\{ordered\}/);
  assert.match(panel, /\.slice\(0, 12\)/);
  assert.equal(panel.includes("serverPriority"), false);
});
