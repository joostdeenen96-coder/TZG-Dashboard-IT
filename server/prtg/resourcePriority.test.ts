import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  clampPage,
  compactVolumeName,
  getResourceLoadScore,
  getServerPriority,
  paginateServers,
  primaryVolume,
  sortServersByPriority,
  stepServerPage,
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

test("SORT hoogste belasting eerst binnen dezelfde status, Warning blijft boven een hoger percentage", () => {
  const servers = [
    server("A", { memory: metric("Geheugen", 90, "up") }),
    server("B", { memory: metric("Geheugen", 70, "warning") }),
    server("C", { cpu: metric("CPU", 10, "down") }),
    server("D", { storage: [metric("C:", 95, "warning")] }),
    server("E", { cpu: metric("CPU", 95, "up") }),
  ];
  assert.deepEqual(
    sortServersByPriority(servers, []).map((item) => item.id),
    ["C", "D", "B", "E", "A"],
  );
});

test("SORT onbekende metrics worden overgeslagen en een lege score komt achteraan", () => {
  const known = server("bekend", { cpu: null, memory: metric("Geheugen", 82, "up"), storage: [metric("C:", 70, "up")] });
  const empty = server("leeg", { cpu: metric("CPU", null, "unknown"), memory: null, storage: [] });
  assert.equal(getResourceLoadScore(known), 82);
  assert.equal(getResourceLoadScore(empty), null);
  assert.deepEqual(
    sortServersByPriority([empty, known], []).map((item) => item.id),
    ["bekend", "leeg"],
  );
  const original = [empty, known].map((item) => item.id);
  sortServersByPriority([empty, known], []);
  assert.deepEqual([empty, known].map((item) => item.id), original);
});

test("SORT gelijke score houdt de oorspronkelijke volgorde", () => {
  const servers = [
    server("eerste", { cpu: metric("CPU", 50), memory: metric("Geheugen", 40), storage: [metric("C:", 40)] }),
    server("tweede", { cpu: metric("CPU", 50), memory: metric("Geheugen", 20), storage: [metric("C:", 30)] }),
  ];
  assert.equal(getResourceLoadScore(servers[0]!), 50);
  assert.equal(getResourceLoadScore(servers[1]!), 50);
  assert.deepEqual(
    sortServersByPriority(servers, []).map((item) => item.id),
    ["eerste", "tweede"],
  );
});

test("PAG1 PAG2 PAG3 twintig servers vullen 9, 9 en 2 zonder duplicaten of verlies", () => {
  const servers = Array.from({ length: 20 }, (_, index) => server(`s${index}`));
  const pages = paginateServers(sortServersByPriority(servers, []));
  assert.equal(pages[0]?.length, 9);
  assert.equal(pages[1]?.length, 9);
  assert.equal(pages[2]?.length, 2);
  const flat = pages.flat().map((item) => item.id);
  assert.equal(flat.length, 20);
  assert.equal(new Set(flat).size, 20);
});

test("PAG4 PAG5 PAG6 handmatig bladeren loopt rond", () => {
  assert.equal(stepServerPage(0, 3, -1), 2);
  assert.equal(stepServerPage(2, 3, 1), 0);
  assert.equal(stepServerPage(0, 3, 1), 1);
  assert.equal(stepServerPage(1, 3, -1), 0);
  assert.equal(stepServerPage(0, 1, 1), 0);
});

test("PAG7 PAG8 de huidige pagina blijft staan en een te hoge pagina wordt de laatste", () => {
  assert.equal(clampPage(1, 3), 1);
  assert.equal(clampPage(4, 2), 1);
  assert.equal(clampPage(0, 1), 0);
  const panel = read("src/components/PrtgServersPanel.tsx");
  assert.equal(panel.includes("setPage(0)"), false);
  assert.match(panel, /clampPage\(current, pageCount\)/);
  assert.equal(panel.includes("setInterval"), false);
});

test("PAG9 PAG10 en SORT refresh een Warning van pagina 3 komt op pagina 1 en het totaal blijft gelijk", () => {
  const servers = Array.from({ length: 20 }, (_, index) => server(`s${index}`));
  const before = sortServersByPriority(servers, []);
  const beforePages = paginateServers(before);
  assert.equal(beforePages[2]?.some((item) => item.id === "s19"), true);
  const promoted = servers.map((item) =>
    item.id === "s19" ? server("s19", { storage: [metric("C:", 88, "warning")] }) : item,
  );
  const after = sortServersByPriority(promoted, []);
  const afterPages = paginateServers(after);
  assert.equal(afterPages[0]?.[0]?.id, "s19");
  assert.equal(afterPages.flat().length, 20);
  assert.equal(new Set(afterPages.flat().map((item) => item.id)).size, 20);
  let page = 2;
  page = clampPage(page, afterPages.length);
  assert.equal(page, 2);
  assert.equal(afterPages[page]?.some((item) => item.id === "s19"), false);
});

test("LAY1 tot LAY8 het 16:9-scherm toont 3 bij 3 en 4K blijft bij negen kaarten", () => {
  const desktop = visibleResourceCards(1920, 1080);
  const wide = visibleResourceCards(2560, 1440);
  const fourk = visibleResourceCards(3840, 2160);
  assert.equal(desktop.columns, 3);
  assert.equal(desktop.rows, 3);
  assert.equal(desktop.visible, 9);
  assert.equal(wide.columns, 3);
  assert.equal(fourk.columns, 3);
  assert.equal(fourk.visible, 9);
  assert.ok(fourk.scale > wide.scale);
  assert.equal(visibleResourceCards(800, 600).columns, 2);
  assert.equal(visibleResourceCards(600, 800).columns, 1);
  const css = read("src/index.css");
  const resourceCss = css.slice(css.indexOf("/* Resources"), css.indexOf(".dashboard-detail-overlay"));
  assert.match(resourceCss, /grid-template-rows:\s*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(resourceCss, /overflow:\s*hidden/);
  assert.equal(resourceCss.includes("460px"), false);
  assert.equal(/(?<![a-z-])transform\s*:/.test(resourceCss), false);
  const page = read("src/pages/IctDashboardPage.tsx");
  const panel = read("src/components/PrtgServersPanel.tsx");
  assert.match(page, /overflow-hidden/);
  assert.match(panel, /overflow-hidden/);
  assert.match(panel, /data-server-pager/);
  assert.match(panel, /data-testid="server-page-prev"/);
  assert.match(panel, /data-testid="server-page-next"/);
  assert.match(panel, /type="button"/);
  assert.match(panel, /servers=\{resourcePage\}/);
  assert.match(panel, /key=\{selected\.server\.id\}/);
  assert.match(panel, /\.slice\(0, 12\)/);
});
