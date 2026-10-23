import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { sanitize } from "../log.js";
import { parseDashboardConfig } from "../services/dashboardConfig.js";
import { amsterdamDayBounds, amsterdamWallToUtcMs, amsterdamYmd } from "./dates.js";
import { mapShipPlanningEntry, orderEntries } from "./mapRecord.js";
import type { ShipPlanningEntry } from "./model.js";
import { SHIP_PLANNING_ENTITY_TYPE_ID, SHIP_PLANNING_QUERY_PATH, shipPlanningDayFilter, shipPlanningQueryBody } from "./pluginQuery.js";
import { getShipPlanning, resetShipPlanningCache, type ShipPlanningReader, type ShipPlanningServiceDeps } from "./service.js";
import { TeunesenShipPlanningProvider } from "./teunesenShipPlanningProvider.js";
import { groupEntries } from "../../src/shipPlanning/groupEntries.ts";
import { buildLocationPages, orderLocationGroups, rowsPerColumn } from "../../src/shipPlanning/rotation.ts";

const root = path.resolve(import.meta.dirname, "../..");

function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

function walkSources(dir: string, into: string[] = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (name === "node_modules" || name === "dist") continue;
      walkSources(full, into);
      continue;
    }
    if (/\.(tsx?|css)$/.test(name)) into.push(full);
  }
  return into;
}

function entry(partial: Partial<ShipPlanningEntry> & Pick<ShipPlanningEntry, "loadingLocation" | "sourceOrder">): ShipPlanningEntry {
  return {
    sourceId: partial.sourceId ?? null,
    sourceOrder: partial.sourceOrder,
    loadingLocation: partial.loadingLocation,
    time: partial.time ?? "07:00",
    customer: partial.customer ?? "Klant",
    unloadingLocation: partial.unloadingLocation ?? "Loskade",
    condition: partial.condition ?? "nat",
    product: partial.product ?? "Zand",
    quantity: partial.quantity ?? 1200,
    quantityUnit: partial.quantityUnit ?? null,
    vessel: partial.vessel ?? "Schip",
    orderNumber: partial.orderNumber ?? "1",
    carrier: partial.carrier ?? "Vervoerder",
    phoneNumber: partial.phoneNumber ?? null,
    unloadingDate: partial.unloadingDate ?? "2026-10-23",
    planningRemark: partial.planningRemark ?? null,
  };
}

function queryResult(date: string, locations: string[]) {
  const entities = locations.map((location, index) => ({
    entityId: `id-${date}-${index}`,
    volgorde: index,
    laaddatum: amsterdamWallToUtcMs(2026, 10, 23, 7, index, 0),
    losdatum: amsterdamWallToUtcMs(2026, 10, 23, 16, 0, 0),
    geplande_hoeveelheid: 100 + index,
    ordernummer: String(1000 + index),
    opmerkingenveld_planning: index === 0 ? "kade" : "",
    klant: { zoeknaam: `Klant ${index}` },
    conditie: { omschrijving: "nat" },
    laadplaats: { zoeknaam: location },
    losplaats: { naam: "Loskade" },
    product: { naam: "Zand" },
    schip: { naam: `Schip ${index}`, telefoonnummer_schipper: "0612345678" },
    vervoerder: { naam: "Vervoerder" },
    editedDate: 1_792_667_589_704,
  }));
  const entries = orderEntries(entities.map((row) => mapShipPlanningEntry(row)));
  return {
    date,
    entityTypeId: SHIP_PLANNING_ENTITY_TYPE_ID,
    queryPath: SHIP_PLANNING_QUERY_PATH,
    recordCount: entities.length,
    totalCount: entities.length,
    complete: true,
    entries,
    entities,
  };
}

function deps(reader: ShipPlanningReader, extra: Partial<ShipPlanningServiceDeps> = {}): ShipPlanningServiceDeps {
  return {
    reader,
    now: () => new Date("2026-10-22T10:00:00Z"),
    settings: () => ({ enabled: true, displayMode: "Tomorrow", refreshIntervalSeconds: 300, maxRows: 80 }),
    credentialsConfigured: () => true,
    refreshMs: 300_000,
    ...extra,
  };
}

test("SP1 SP2 authenticatieclient en entityTypeId 255 blijven server-side", async () => {
  const client = read("server/shipPlanning/client.ts");
  const provider = read("server/shipPlanning/teunesenShipPlanningProvider.ts");
  assert.match(client, /\/api\/user-access\/authenticate/);
  assert.equal(client.includes("console."), false);
  assert.equal(SHIP_PLANNING_ENTITY_TYPE_ID, 255);
  assert.equal(SHIP_PLANNING_QUERY_PATH, "/api/data/255/query");
  assert.equal(provider.includes("/api/data/v2/"), false);
  const seen: Array<{ url: string; auth: string | null; body: Record<string, unknown> | null }> = [];
  const previousUser = process.env.SHIP_PLANNING_USERNAME;
  const previousPass = process.env.SHIP_PLANNING_PASSWORD;
  process.env.SHIP_PLANNING_USERNAME = "service-account";
  process.env.SHIP_PLANNING_PASSWORD = "not-a-real-secret";
  const fetchImpl: typeof fetch = async (input, init) => {
    const headers = new Headers(init?.headers);
    seen.push({
      url: String(input),
      auth: headers.get("authorization"),
      body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null,
    });
    if (String(input).endsWith("/authenticate")) {
      return new Response(JSON.stringify({ token: "bearer-test-token" }), { status: 200 });
    }
    return new Response(JSON.stringify({ entities: [], totalCount: 0 }), { status: 200 });
  };
  try {
    const planning = new TeunesenShipPlanningProvider(fetchImpl);
    await planning.queryTomorrow(new Date("2026-10-22T10:00:00Z"), 5);
  } finally {
    if (previousUser === undefined) delete process.env.SHIP_PLANNING_USERNAME;
    else process.env.SHIP_PLANNING_USERNAME = previousUser;
    if (previousPass === undefined) delete process.env.SHIP_PLANNING_PASSWORD;
    else process.env.SHIP_PLANNING_PASSWORD = previousPass;
  }
  assert.equal(seen[0]?.url.endsWith("/api/user-access/authenticate"), true);
  assert.equal(seen[0]?.auth, null);
  assert.equal(seen[1]?.url.endsWith("/api/data/255/query"), true);
  assert.equal(seen[1]?.auth, "Bearer bearer-test-token");
  assert.equal(JSON.stringify(seen).includes("not-a-real-secret") && seen[0]?.body?.password === "not-a-real-secret", true);
  assert.equal(seen[1]?.body?.password, undefined);
});

test("SP3 SP4 SP5 morgen, vandaag en Europe/Amsterdam", () => {
  const now = new Date("2026-10-22T22:30:00Z");
  assert.equal(amsterdamYmd(now, 0), "2026-10-23");
  assert.equal(amsterdamYmd(now, 1), "2026-10-24");
  const winter = amsterdamDayBounds("2026-01-15");
  const summer = amsterdamDayBounds("2026-07-15");
  assert.equal(winter.startMs, Date.parse("2026-01-14T23:00:00Z"));
  assert.equal(summer.startMs, Date.parse("2026-07-14T22:00:00Z"));
  assert.equal(winter.endMs, Date.parse("2026-01-15T22:59:59Z"));
  assert.equal(summer.endMs, Date.parse("2026-07-15T21:59:59Z"));
  const tomorrow = amsterdamDayBounds(amsterdamYmd(new Date("2026-10-22T10:00:00Z"), 1));
  const today = amsterdamDayBounds(amsterdamYmd(new Date("2026-10-22T10:00:00Z"), 0));
  const tomorrowFilter = shipPlanningDayFilter(tomorrow.startMs, tomorrow.endMs);
  const todayFilter = shipPlanningDayFilter(today.startMs, today.endMs);
  assert.match(tomorrowFilter, /laaddatum GEQ/);
  assert.match(tomorrowFilter, /losdatum LEQ/);
  assert.match(tomorrowFilter, /status NEQ "geannuleerd"/);
  assert.notEqual(todayFilter, tomorrowFilter);
  const body = shipPlanningQueryBody(tomorrow.startMs, tomorrow.endMs, 999);
  assert.equal(body.pageSize, 999);
  assert.match(body.project, /laadplaats\.zoeknaam/);
  assert.match(body.project, /schip\.telefoonnummer_schipper/);
});

test("SP6 veldmapping gebruikt alleen aangetroffen pluginpaden", () => {
  const mapped = mapShipPlanningEntry({
    entityId: "rit-1",
    volgorde: 3,
    laaddatum: amsterdamWallToUtcMs(2026, 10, 23, 7, 0, 0),
    losdatum: amsterdamWallToUtcMs(2026, 10, 26, 0, 0, 0),
    geplande_hoeveelheid: 1200,
    ordernummer: "4500",
    opmerkingenveld_planning: "kade 2",
    klant: { zoeknaam: "Testklant" },
    conditie: { omschrijving: "nat" },
    laadplaats: { zoeknaam: "HOOFDSTRAAT" },
    losplaats: { naam: "Loskade" },
    product: { naam: "Zand" },
    schip: { naam: "Testschip", telefoonnummer_schipper: "0612345678" },
    vervoerder: { naam: "Testvervoer" },
    editedDate: 1_792_667_589_704,
  });
  assert.equal(mapped.sourceId, "rit-1");
  assert.equal(mapped.sourceOrder, 3);
  assert.equal(mapped.loadingLocation, "HOOFDSTRAAT");
  assert.equal(mapped.time, "07:00");
  assert.equal(mapped.customer, "Testklant");
  assert.equal(mapped.unloadingLocation, "Loskade");
  assert.equal(mapped.condition, "nat");
  assert.equal(mapped.product, "Zand");
  assert.equal(mapped.quantity, 1200);
  assert.equal(mapped.quantityUnit, null);
  assert.equal(mapped.vessel, "Testschip");
  assert.equal(mapped.orderNumber, "4500");
  assert.equal(mapped.carrier, "Testvervoer");
  assert.equal(mapped.phoneNumber, "0612345678");
  assert.equal(mapped.unloadingDate, "2026-10-26");
  assert.equal(mapped.planningRemark, "kade 2");
  const missing = mapShipPlanningEntry({ entityId: "leeg", volgorde: 1 });
  assert.equal(missing.customer, null);
  assert.equal(missing.time, null);
  assert.equal(missing.quantityUnit, null);
});

test("SP7-SP12 laadplaatsen blijven in bronvolgorde, inclusief extra locaties", () => {
  const ordered = orderEntries([
    entry({ loadingLocation: "KAMPERGEUL (DEKKER)", sourceOrder: 4 }),
    entry({ loadingLocation: "HOOFDSTRAAT", sourceOrder: 0 }),
    entry({ loadingLocation: "GVI CUIJK", sourceOrder: 2 }),
    entry({ loadingLocation: "TEUNESEN OVERSLAG VENLO", sourceOrder: 3 }),
    entry({ loadingLocation: "HOOGVELD(I)", sourceOrder: 1 }),
  ]);
  const groups = groupEntries(ordered);
  assert.deepEqual(
    groups.map((group) => group.location),
    ["HOOFDSTRAAT", "HOOGVELD(I)", "GVI CUIJK", "TEUNESEN OVERSLAG VENLO", "KAMPERGEUL (DEKKER)"],
  );
  assert.notDeepEqual(
    groups.map((group) => group.location),
    [...groups.map((group) => group.location)].sort((a, b) => a.localeCompare(b)),
  );
});

test("SP13 SP14 minimale en aanvullende velden", () => {
  const mapped = mapShipPlanningEntry({
    volgorde: 1,
    laaddatum: amsterdamWallToUtcMs(2026, 10, 23, 8, 30, 0),
    klant: { zoeknaam: "Klant" },
    losplaats: { naam: "Haven" },
    conditie: { omschrijving: "droog" },
    product: { naam: "Grind" },
    geplande_hoeveelheid: 950,
    schip: { naam: "Astra" },
    ordernummer: "88",
    vervoerder: { naam: "Rederij" },
    schip_telefoon_ontbreekt: true,
    losdatum: amsterdamWallToUtcMs(2026, 10, 24, 6, 0, 0),
    opmerkingenveld_planning: "let op diepte",
  });
  for (const value of [mapped.time, mapped.customer, mapped.unloadingLocation, mapped.condition, mapped.product, mapped.quantity, mapped.vessel]) {
    assert.notEqual(value, null);
  }
  assert.equal(mapped.orderNumber, "88");
  assert.equal(mapped.carrier, "Rederij");
  assert.equal(mapped.phoneNumber, null);
  assert.equal(mapped.unloadingDate, "2026-10-24");
  assert.equal(mapped.planningRemark, "let op diepte");
});

test("SP15-SP19 cache, gedeelde fetch, stale, unavailable en herstel", async () => {
  resetShipPlanningCache();
  let fail = false;
  let calls = 0;
  const reader: ShipPlanningReader = {
    async queryToday() {
      calls += 1;
      if (fail) throw Object.assign(new Error("query entityTypeId 255 HTTP 503"), { status: 503 });
      return queryResult("2026-10-22", ["HOOFDSTRAAT"]);
    },
    async queryTomorrow() {
      calls += 1;
      if (fail) throw Object.assign(new Error("query entityTypeId 255 HTTP 503"), { status: 503 });
      return queryResult("2026-10-23", ["HOOFDSTRAAT", "HOOGVELD(I)"]);
    },
  };
  const first = await getShipPlanning("tomorrow", deps(reader));
  const second = await getShipPlanning("tomorrow", deps(reader));
  assert.equal(first.status, "ok");
  assert.equal(second, first);
  assert.equal(calls, 1);
  assert.equal(first.days[0]?.sourceUpdatedAt, new Date(1_792_667_589_704).toISOString());
  const serialized = JSON.stringify(first);
  assert.equal(serialized.includes("password"), false);
  assert.equal(serialized.includes("refreshToken"), false);
  assert.equal(serialized.includes("authorization"), false);
  assert.equal(serialized.includes("bearer-test-token"), false);

  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let sharedCalls = 0;
  const slow: ShipPlanningReader = {
    async queryToday() {
      return queryResult("2026-10-22", ["HOOFDSTRAAT"]);
    },
    async queryTomorrow() {
      sharedCalls += 1;
      await gate;
      return queryResult("2026-10-23", ["GVI CUIJK"]);
    },
  };
  resetShipPlanningCache();
  const left = getShipPlanning("tomorrow", deps(slow));
  const right = getShipPlanning("tomorrow", deps(slow));
  release();
  const [leftResult, rightResult] = await Promise.all([left, right]);
  assert.equal(leftResult, rightResult);
  assert.equal(sharedCalls, 1);

  resetShipPlanningCache();
  fail = false;
  calls = 0;
  await getShipPlanning("tomorrow", deps(reader, { refreshMs: 0 }));
  fail = true;
  const stale = await getShipPlanning("tomorrow", deps(reader, { refreshMs: 0 }));
  assert.equal(stale.status, "stale");
  assert.equal(stale.days[0]?.entries.length, 2);
  fail = false;
  const recovered = await getShipPlanning("tomorrow", deps(reader, { refreshMs: 0 }));
  assert.equal(recovered.status, "ok");

  resetShipPlanningCache();
  fail = true;
  const missing = await getShipPlanning("tomorrow", deps(reader, { refreshMs: 0 }));
  assert.equal(missing.status, "unavailable");
  assert.equal(missing.days[0]?.entries.length, 0);
  const disabled = await getShipPlanning(
    "tomorrow",
    deps(reader, { settings: () => ({ enabled: false, displayMode: "Tomorrow", refreshIntervalSeconds: 300, maxRows: 80 }) }),
  );
  assert.equal(disabled.status, "disabled");
  resetShipPlanningCache();
});

test("SP20 SP21 geen secrets in frontend of logs", () => {
  const frontend = walkSources(path.join(root, "src"))
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
  assert.equal(frontend.includes("SHIP_PLANNING_PASSWORD"), false);
  assert.equal(frontend.includes("SHIP_PLANNING_USERNAME"), false);
  assert.equal(frontend.includes("planning.teunesen.nl"), false);
  const cleaned = sanitize(
    "SHIP_PLANNING_PASSWORD=geheim SHIP_PLANNING_USERNAME=planner Authorization: Bearer aaa.bbb.ccc bel 06 12345678",
  );
  assert.equal(cleaned.includes("geheim"), false);
  assert.equal(cleaned.includes("planner"), false);
  assert.equal(cleaned.includes("aaa.bbb.ccc"), false);
  assert.equal(cleaned.includes("12345678"), false);
  assert.match(cleaned, /SHIP_PLANNING_PASSWORD=\[redacted\]/);
  assert.match(cleaned, /\[telefoon\]/);
});

test("SP22-SP26 weergave Tomorrow, TodayAndTomorrow, Auto en 1920x1080", () => {
  const ordered = orderLocationGroups([
    { location: "KAMPERGEUL (DEKKER)", entries: [entry({ loadingLocation: "KAMPERGEUL (DEKKER)", sourceOrder: 3 })] },
    { location: "GVI CUIJK", entries: [entry({ loadingLocation: "GVI CUIJK", sourceOrder: 2 })] },
    { location: "HOOFDSTRAAT", entries: [entry({ loadingLocation: "HOOFDSTRAAT", sourceOrder: 0 })] },
  ]);
  assert.deepEqual(
    ordered.map((group) => group.label),
    ["Hoofdstraat", "Cuijk", "KAMPERGEUL (DEKKER)"],
  );
  const display = read("src/pages/DisplayPage.tsx");
  const planning = display.slice(display.indexOf("function PlanningLayout"), display.indexOf("function IctLayout"));
  assert.match(planning, /overflow-hidden/);
  assert.match(planning, /planning-display/);
  assert.match(planning, /data-testid="planning-viewport"/);
  assert.match(planning, /data-layout="fluid"/);
  assert.match(planning, /planningGridRows/);
  assert.doesNotMatch(planning, /StageShell/);
  assert.doesNotMatch(planning, /transform:\s*`scale/);
  assert.doesNotMatch(planning, /h-\[368px\]/);
  assert.doesNotMatch(planning, /h-\[320px\]/);
  assert.doesNotMatch(planning, /h-\[400px\]/);
  assert.doesNotMatch(planning, /h-\[120px\]/);
  assert.doesNotMatch(planning, /h-\[118px\]/);
  assert.match(planning, /ShipPlanningBoard/);
  assert.match(planning, /data-testid="planning-ships"/);
  const tracks = read("src/display/planningFluid.tsx");
  assert.match(tracks, /minmax\(0, 39\.4fr\)/);
  assert.match(tracks, /minmax\(0, 32fr\)/);
  assert.match(tracks, /minmax\(0, 11\.1fr\)/);
  assert.match(tracks, /minmax\(0, 6\.5fr\)/);
  assert.match(tracks, /minmax\(0, 47\.4fr\)/);
  assert.match(tracks, /minmax\(0, 24fr\)/);
  assert.match(read("src/components/DashboardDetailModal.tsx"), /data-detail-scroll/);
  assert.match(read("src/components/DashboardDetailModal.tsx"), /role="dialog"/);
  assert.match(read("src/components/DashboardDetailModal.tsx"), /aria-modal="true"/);
  assert.match(read("src/components/ShipPlanningDetailDialog.tsx"), /DashboardDetailModal/);
  assert.match(read("src/components/NewsDetailDialog.tsx"), /DashboardDetailModal/);
  assert.match(read("src/components/NewsCard.tsx"), /data-news-open/);
  assert.match(read("src/components/NewsCard.tsx"), /data-paused/);
  const css = read("src/index.css");
  assert.match(css, /dashboard-detail-scroll/);
  assert.match(css, /overscroll-behavior: contain/);
  assert.match(css, /--ship-row: clamp\(30px, 2\.8vh, 52px\)/);
  assert.match(css, /--ship-row-max: clamp\(46px, 4\.2vh, 72px\)/);
  assert.match(css, /--dashboard-progress-height: clamp\(2px, 0\.2vh, 3px\)/);
  assert.match(css, /--font-display-value: clamp\(36px, 3\.9vh, 64px\)/);
  assert.match(css, /--font-card-title: clamp\(18px, 2\.1vh, 32px\)/);
  assert.match(css, /--font-section-title: clamp\(14px, 1\.55vh, 24px\)/);
  assert.match(css, /--font-table: clamp\(13px, 1\.34vh, 20px\)/);
  assert.match(css, /--font-table-header: clamp\(9px, 0\.95vh, 14px\)/);
  assert.match(css, /--font-body: clamp\(12px, 1\.25vh, 19px\)/);
  assert.match(css, /--font-meta: clamp\(11px, 1\.02vh, 15px\)/);
  assert.match(css, /--font-micro: clamp\(10px, 0\.88vh, 13px\)/);
  assert.match(css, /--font-tile-value: calc\(var\(--font-display-value\) \* 0\.72\)/);
  assert.match(css, /data-surcharge-unavailable/);
  assert.match(read("src/components/DieselCard.tsx"), /data-surcharge-unavailable/);
  assert.match(css, /repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(read("src/components/DieselCard.tsx"), /repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(read("src/components/NewsCard.tsx"), /dashboard-progress-track/);
  assert.match(read("src/components/ShipPlanningBoard.tsx"), /--ship-row-max/);
  assert.match(read("src/components/ShipPlanningBoard.tsx"), /length: SHIPS_PER_COLUMN/);
  assert.match(css, /data-agenda-extra/);
  assert.match(css, /@container agenda \(min-height: 108px\)/);
  assert.doesNotMatch(planning, /transform:\s*`scale\(\$\{scale\}\)`/);
  const agenda = read("src/components/AgendaBar.tsx");
  assert.match(agenda, /data-agenda-title/);
  assert.match(agenda, /data-agenda-day/);
  assert.match(agenda, /Hele dag/);
  assert.match(agenda, /usePlanningFluid/);
  assert.match(read("src/pages/DisplayPage.tsx"), /overflow-hidden/);
  assert.match(read("server/dashboards/seed.ts"), /stageWidth: 2560, stageHeight: 1440/);
  const dialog = read("src/components/ShipPlanningDetailDialog.tsx");
  for (const label of ["Order", "Vervoerder", "Telnr", "Losdatum", "Opmerking planning", "Planningdatum", "Laadplaats", "Schip"]) {
    assert.match(dialog, new RegExp(label));
  }
  const board = read("src/components/ShipPlanningBoard.tsx");
  assert.match(board, /Schepenplanning vandaag/);
  assert.match(board, /Schepenplanning morgen/);
  assert.match(board, /Gegevens tijdelijk niet vernieuwd/);
  assert.match(board, /ROTATION_MS/);
  assert.match(dialog, /testId="ship-planning-detail"/);
  assert.match(read("src/components/DashboardDetailModal.tsx"), /data-testid=\{testId\}/);
  assert.match(read("src/components/DashboardDetailModal.tsx"), /createPortal/);
});

test("SP27-SP33 player, bestaande tegels en ICT", () => {
  const player = read("src/pages/PlayerPage.tsx");
  assert.match(player, /DashboardCanvas/);
  const display = read("src/pages/DisplayPage.tsx");
  const planning = display.slice(display.indexOf("function PlanningLayout"), display.indexOf("function IctLayout"));
  const ict = display.slice(display.indexOf("function IctLayout"), display.indexOf("function StackLayout"));
  assert.match(planning, /waterlevels|active\.get\("waterlevels"\)/);
  assert.match(planning, /active\.get\("diesel"\)/);
  assert.match(planning, /weatherSettings/);
  assert.match(planning, /active\.get\("agenda"\)/);
  assert.equal(ict.includes("ShipPlanning"), false);
  assert.match(ict, /StageShell/);
  assert.match(ict, /active\.get\("prtg"\)/);
  const diesel = read("src/components/DieselCard.tsx");
  assert.match(diesel, /Dieseltoeslag/);
  assert.match(diesel, /Nederland/);
  assert.match(diesel, /België/);
  assert.match(read("src/components/Header.tsx"), /WeatherCard/);
  assert.match(read("src/widgets/WaterLevelsWidget.tsx"), /WaterLevelCard/);
});

test("SP admin zonder credentials en diagnostisch script", () => {
  const config = parseDashboardConfig({
    sharepointDiesel: {
      siteUrl: "https://teunesen.sharepoint.com/sites/Facturatie",
      lijstnaam: "Dieseltoeslagen Asvervoer",
    },
    sharepointNieuws: {
      siteUrl: "https://teunesen.sharepoint.com/sites/wt-nieuws",
      bibliotheek: "Sitepagina's",
    },
    weer: { plaatsnaam: "Gennep" },
    dashboard: { refreshInterval: 300, aantalNieuwsitems: 3 },
    prtg: { groupId: "", tag: "" },
    shipPlanning: { enabled: false, displayMode: "Auto", refreshIntervalSeconds: 120, maxRows: 40, password: "nope" },
  });
  assert.equal(config.shipPlanning.enabled, false);
  assert.equal(config.shipPlanning.displayMode, "Auto");
  assert.equal(config.shipPlanning.refreshIntervalSeconds, 120);
  assert.equal(JSON.stringify(config.shipPlanning).includes("nope"), false);
  const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
  assert.equal(pkg.scripts["ship-planning:test-query"], "node dist/server/shipPlanning/testQuery.js");
  const admin = read("src/components/AdminShipPlanningSection.tsx");
  assert.match(admin, /Configured/);
  assert.match(admin, /Not configured/);
  assert.equal(admin.includes("SHIP_PLANNING_PASSWORD"), false);
});

test("V4-V14 adaptieve kolommen, paginering en compacte kaart", () => {
  const ships = (location: string, count: number) =>
    Array.from({ length: count }, (_, index) => entry({ loadingLocation: location, sourceOrder: index, sourceId: `${location}-${index}` }));

  const few = buildLocationPages([{ location: "HOOGVELD(I)", entries: ships("HOOGVELD(I)", 3) }], 6);
  assert.equal(few.length, 1);
  assert.equal(few[0]?.columns, 1);
  assert.equal(few[0]?.left.length, 3);
  assert.equal(few[0]?.right.length, 0);
  assert.equal(few[0]?.locationCount, 3);

  const twelve = buildLocationPages([{ location: "HOOFDSTRAAT", entries: ships("HOOFDSTRAAT", 12) }], 6);
  assert.equal(twelve.length, 1);
  assert.equal(twelve[0]?.columns, 2);
  assert.deepEqual(
    twelve[0]?.left.map((item) => item.sourceOrder),
    [0, 1, 2, 3, 4, 5],
  );
  assert.deepEqual(
    twelve[0]?.right.map((item) => item.sourceOrder),
    [6, 7, 8, 9, 10, 11],
  );

  const eighteen = buildLocationPages([{ location: "HOOFDSTRAAT", entries: ships("HOOFDSTRAAT", 18) }], 6);
  assert.equal(eighteen.length, 2);
  assert.equal(eighteen[0]?.columns, 2);
  assert.equal(eighteen[0]?.left.length, 6);
  assert.equal(eighteen[0]?.right.length, 6);
  assert.equal(eighteen[1]?.columns, 1);
  assert.equal(eighteen[1]?.pageInLocation, 1);
  assert.equal(eighteen[1]?.locationPageCount, 2);
  assert.equal(eighteen[1]?.locationCount, 18);
  assert.deepEqual(
    eighteen.flatMap((page) => [...page.left, ...page.right].map((item) => item.sourceOrder)),
    Array.from({ length: 18 }, (_, index) => index),
  );

  for (const count of [1, 2, 3, 4, 5, 6]) {
    const single = buildLocationPages([{ location: "TEUNESEN OVERSLAG VENLO", entries: ships("TEUNESEN OVERSLAG VENLO", count) }], 6);
    assert.equal(single.length, 1);
    assert.equal(single[0]?.columns, 1);
    assert.equal(single[0]?.left.length, count);
    assert.equal(single[0]?.right.length, 0);
  }

  const seven = buildLocationPages([{ location: "HOOFDSTRAAT", entries: ships("HOOFDSTRAAT", 7) }], 6);
  assert.equal(seven.length, 1);
  assert.equal(seven[0]?.columns, 2);
  assert.deepEqual(
    seven[0]?.left.map((item) => item.sourceOrder),
    [0, 1, 2, 3, 4, 5],
  );
  assert.deepEqual(
    seven[0]?.right.map((item) => item.sourceOrder),
    [6],
  );

  const eight = buildLocationPages([{ location: "HOOFDSTRAAT", entries: ships("HOOFDSTRAAT", 8) }], 6);
  assert.equal(eight[0]?.columns, 2);
  assert.deepEqual(
    eight[0]?.left.map((item) => item.sourceOrder),
    [0, 1, 2, 3, 4, 5],
  );
  assert.deepEqual(
    eight[0]?.right.map((item) => item.sourceOrder),
    [6, 7],
  );

  assert.equal(rowsPerColumn(288, 32), 9);
  assert.equal(rowsPerColumn(32, 32), 1);
  assert.equal(rowsPerColumn(63, 32), 1);
  assert.equal(rowsPerColumn(64, 32), 2);

  const board = read("src/components/ShipPlanningBoard.tsx");
  for (const label of ["Tijd", "Klant", "Losplaats", "Conditie", "Product", "Hoeveelheid", "Schip"]) {
    assert.match(board, new RegExp(label));
  }
  for (const hidden of ["Vervoerder", "Telnr", "Losdatum", "Opmerking"]) {
    assert.equal(board.includes(hidden), false);
  }
  assert.match(board, /grid-cols-2/);
  assert.equal(board.includes("max-w-[1240px]"), false);
  assert.match(board, /SHIPS_PER_COLUMN/);
  assert.match(board, /ship-rotation-progress/);
  assert.match(board, /data-paused/);
  assert.match(read("src/index.css"), /prefers-reduced-motion: reduce/);
  assert.match(read("src/index.css"), /animation-play-state: paused/);
  assert.match(board, /ROW_HEIGHT = 40/);
  assert.match(board, /text-right/);
  assert.match(board, /truncate/);
  assert.equal(/overflow-y-auto|marquee/.test(board), false);
  assert.match(board, /ROTATION_MS/);
});
