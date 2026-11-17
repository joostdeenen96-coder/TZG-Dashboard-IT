import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test, { mock } from "node:test";
import { SERVER_RESOURCE_REFRESH_MS, startServerResourcePoll } from "../../src/services/serverResourcePoll.ts";

const root = path.resolve(import.meta.dirname, "../..");

function read(relative: string) {
  return readFileSync(path.join(root, relative), "utf8");
}

test("SR9 SR10 SR11 de popup pollt exact eens per minuut en stopt bij sluiten", () => {
  assert.equal(SERVER_RESOURCE_REFRESH_MS, 60_000);
  mock.timers.enable({ apis: ["setInterval"] });
  try {
    let calls = 0;
    const stop = startServerResourcePoll(() => {
      calls += 1;
    });
    assert.equal(calls, 1);
    mock.timers.tick(59_000);
    assert.equal(calls, 1);
    mock.timers.tick(1_000);
    assert.equal(calls, 2);
    mock.timers.tick(60_000);
    assert.equal(calls, 3);
    stop();
    mock.timers.tick(180_000);
    assert.equal(calls, 3);
  } finally {
    mock.timers.reset();
  }
});

test("SR12 de browser praat alleen met de eigen API", () => {
  const client = read("src/services/serverResourceService.ts");
  assert.match(client, /\/api\/ict\/servers\//);
  assert.equal(client.includes("prtg."), false);
  assert.equal(client.includes("passhash"), false);
  assert.equal(client.includes("table.json"), false);
  const dialog = read("src/components/ServerResourceDialog.tsx");
  assert.match(dialog, /startServerResourcePoll/);
  assert.equal(dialog.includes("fetch("), false);
});

test("SR26-SR33 SR34 tegels en dialoog gebruiken de bestaande modal", () => {
  const panel = read("src/components/PrtgServersPanel.tsx");
  const dialog = read("src/components/ServerResourceDialog.tsx");
  const modal = read("src/components/DashboardDetailModal.tsx");
  assert.match(panel, /motion\.button/);
  assert.match(panel, /type="button"/);
  assert.match(panel, /aria-label=\{`Open details van server/);
  assert.match(panel, /cursor-pointer/);
  assert.match(panel, /hover:border-gold\/40/);
  assert.match(panel, /focus-visible:outline-gold/);
  assert.match(panel, /onClick=\{\(event\) => setSelected/);
  assert.match(dialog, /DashboardDetailModal/);
  assert.match(dialog, /testId="server-resource-dialog"/);
  assert.match(dialog, /returnFocus/);
  assert.match(dialog, /Servergegevens worden opgehaald/);
  assert.match(dialog, /Servergegevens tijdelijk niet beschikbaar/);
  assert.match(dialog, /Gegevens tijdelijk niet vernieuwd/);
  assert.match(modal, /role="dialog"/);
  assert.match(modal, /aria-modal="true"/);
  assert.match(modal, /aria-labelledby/);
  assert.match(modal, /Escape/);
  assert.match(modal, /aria-label="Sluiten"/);
  assert.match(modal, /onClick=\{requestClose\}/);
  assert.match(modal, /restore\.focus\(\)/);
});

test("SR35 SR36 refresh vervangt de scrollcontainer niet", () => {
  const dialog = read("src/components/ServerResourceDialog.tsx");
  const modal = read("src/components/DashboardDetailModal.tsx");
  assert.equal(dialog.includes("key={payload"), false);
  assert.equal(dialog.includes("key={server.retrievedAt"), false);
  assert.match(modal, /data-detail-scroll/);
  assert.match(panelScroll(dialog), /setPayload\(next\)/);
});

function panelScroll(dialog: string) {
  return dialog;
}

test("SR37 SR38 SR39 SR41 de modal blijft in beeld en de pagina scrollt niet", () => {
  const css = read("src/index.css");
  const modal = read("src/components/DashboardDetailModal.tsx");
  assert.match(css, /max-height:\s*min\(85vh,\s*960px\)/);
  assert.match(css, /overflow:\s*hidden/);
  assert.match(css, /\.dashboard-detail-scroll[\s\S]*overflow:\s*auto/);
  assert.match(modal, /document\.body\.style\.overflow = "hidden"/);
  assert.match(modal, /dashboard-detail-header/);
  assert.match(modal, /dashboard-detail-close/);
});

test("SR40 een lange sensorlijst staat in Overige sensoren", () => {
  const dialog = read("src/components/ServerResourceDialog.tsx");
  assert.match(dialog, /Overige sensoren/);
  assert.match(dialog, /server\.otherSensors\.map/);
  assert.match(dialog, /Waarschuwingen/);
});

test("detailstatus maakt de healthcheck niet unhealthy", () => {
  const health = read("server/services/healthService.ts");
  assert.match(health, /server-resources/);
  assert.match(health, /getServerResourceProbe/);
});
