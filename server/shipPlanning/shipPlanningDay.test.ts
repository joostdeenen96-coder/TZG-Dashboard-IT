import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { parseDashboardConfig } from "../services/dashboardConfig.js";
import { amsterdamWallToUtcMs } from "./dates.js";
import {
  activePlanningDay,
  emptyConfirmationCountFromEnv,
  observeTodayQuery,
  resetTodayEmptyConfirmation,
  verdictForDay,
} from "./daySelection.js";
import { mapShipPlanningEntry } from "./mapRecord.js";
import type { ShipPlanningEntry } from "./model.js";
import { getShipPlanning, resetShipPlanningCache, type ShipPlanningReader, type ShipPlanningServiceDeps } from "./service.js";
import { TeunesenShipPlanningProvider, isCancelledEntity, type ShipPlanningDayQuery } from "./teunesenShipPlanningProvider.js";
import { formatPlanningDate, planningTodayMark, shipPlanningTitle } from "../../src/shipPlanning/amsterdamDate.ts";
import { buildLocationPages, nextRotationIndex, orderLocationGroups, stepLocationIndex } from "../../src/shipPlanning/rotation.ts";

const root = path.resolve(import.meta.dirname, "../..");

function entry(location: string, sourceOrder: number): ShipPlanningEntry {
  return {
    sourceId: `${location}-${sourceOrder}`,
    sourceOrder,
    loadingLocation: location,
    loadingAt: null,
    time: "07:00",
    customer: "Klant",
    unloadingLocation: "Loskade",
    condition: "nat",
    product: "Zand",
    quantity: 100,
    quantityUnit: null,
    vessel: "Schip",
    orderNumber: "1",
    carrier: null,
    phoneNumber: null,
    unloadingDate: "2026-10-23",
    planningRemark: null,
  };
}

function dayQuery(date: string, locations: string[], extra: Partial<ShipPlanningDayQuery> = {}): ShipPlanningDayQuery {
  const entries = locations.map((location, index) => entry(location, index));
  return {
    date,
    entityTypeId: 255,
    queryPath: "/api/data/255/query",
    recordCount: entries.length,
    totalCount: entries.length,
    complete: true,
    entries,
    entities: entries,
    ...extra,
  };
}

function harness(reader: ShipPlanningReader, now: () => Date, mode: ShipPlanningServiceDeps["settings"] extends () => infer S ? S["displayMode"] : never = "Auto") {
  const deps: ShipPlanningServiceDeps = {
    reader,
    now,
    settings: () => ({ enabled: true, displayMode: mode, refreshIntervalSeconds: 300, maxRows: 80 }),
    credentialsConfigured: () => true,
    refreshMs: 0,
    emptyConfirmationCount: 2,
  };
  return deps;
}

test("A1 A2 D2 D3 vandaag met records blijft vandaag", async () => {
  resetShipPlanningCache();
  let tomorrowCalls = 0;
  const reader: ShipPlanningReader = {
    async queryToday() {
      return dayQuery("2026-10-22", Array.from({ length: 23 }, () => "HOOFDSTRAAT"));
    },
    async queryTomorrow() {
      tomorrowCalls += 1;
      return dayQuery("2026-10-23", ["HOOFDSTRAAT"]);
    },
  };
  const many = await getShipPlanning("auto", harness(reader, () => new Date("2026-10-22T10:00:00Z")));
  assert.equal(many.displayedDay, "today");
  assert.equal(many.switchReason, "today-active");
  assert.equal(many.todayRecordCount, 23);
  assert.equal(many.tomorrowRecordCount, null);
  assert.equal(many.todayEmptyConfirmed, false);
  assert.equal(tomorrowCalls, 0);

  resetShipPlanningCache();
  const one = await getShipPlanning(
    "auto",
    harness(
      {
        async queryToday() {
          return dayQuery("2026-10-22", ["HOOGVELD(I)"]);
        },
        async queryTomorrow() {
          tomorrowCalls += 1;
          return dayQuery("2026-10-23", ["HOOFDSTRAAT"]);
        },
      },
      () => new Date("2026-10-22T10:00:00Z"),
    ),
  );
  assert.equal(one.displayedDay, "today");
  assert.equal(one.todayRecordCount, 1);
  assert.equal(tomorrowCalls, 0);
  assert.equal(activePlanningDay({ todayHasActiveEntries: true, todayConfirmedEmpty: true }), "today");
});

test("A3 A4 A5 A12 D4 D5 D8 D11 lege bevestiging en terugkeer van records", async () => {
  resetShipPlanningCache();
  const script = ["empty", "empty", "records", "empty"] as const;
  let step = 0;
  let tomorrowCalls = 0;
  const reader: ShipPlanningReader = {
    async queryToday() {
      const kind = script[Math.min(step, script.length - 1)];
      step += 1;
      return kind === "records" ? dayQuery("2026-10-22", ["HOOFDSTRAAT", "GVI CUIJK"]) : dayQuery("2026-10-22", []);
    },
    async queryTomorrow() {
      tomorrowCalls += 1;
      return dayQuery("2026-10-23", Array.from({ length: 29 }, () => "HOOFDSTRAAT"));
    },
  };
  const deps = harness(reader, () => new Date("2026-10-22T10:00:00Z"));
  const first = await getShipPlanning("auto", deps);
  assert.equal(first.displayedDay, "today");
  assert.equal(first.todayEmptyConfirmed, false);
  assert.equal(first.todayRecordCount, 0);
  assert.equal(tomorrowCalls, 0);

  const second = await getShipPlanning("auto", deps);
  assert.equal(second.displayedDay, "tomorrow");
  assert.equal(second.switchReason, "today-empty-confirmed");
  assert.equal(second.todayEmptyConfirmed, true);
  assert.equal(second.tomorrowRecordCount, 29);
  assert.equal(second.days[0]?.date, "2026-10-23");
  assert.equal(tomorrowCalls, 1);

  resetShipPlanningCache();
  step = 2;
  tomorrowCalls = 0;
  const back = await getShipPlanning("auto", deps);
  assert.equal(back.displayedDay, "today");
  assert.equal(back.todayRecordCount, 2);
  const again = await getShipPlanning("auto", deps);
  assert.equal(again.displayedDay, "today");
  assert.equal(again.todayEmptyConfirmed, false);
  assert.equal(tomorrowCalls, 0);
});

test("A6 A7 A8 A9 A10 A11 D6 D7 fouten stale en incomplete pagination schakelen niet", async () => {
  resetShipPlanningCache();
  const failures: Array<{ status: number; message: string }> = [
    { status: 500, message: "query entityTypeId 255 HTTP 500" },
    { status: 0, message: "timeout" },
    { status: 401, message: "authenticatie mislukt (HTTP 401)" },
  ];
  for (const failure of failures) {
    resetShipPlanningCache();
    let tomorrowCalls = 0;
    const reader: ShipPlanningReader = {
      async queryToday() {
        throw Object.assign(new Error(failure.message), { status: failure.status });
      },
      async queryTomorrow() {
        tomorrowCalls += 1;
        return dayQuery("2026-10-23", ["HOOFDSTRAAT"]);
      },
    };
    const deps = harness(reader, () => new Date("2026-10-22T10:00:00Z"));
    const missing = await getShipPlanning("auto", deps);
    assert.equal(missing.status, "unavailable");
    assert.equal(missing.switchReason, "source-unavailable");
    assert.equal(missing.displayedDay, "today");
    assert.equal(tomorrowCalls, 0);
  }

  resetShipPlanningCache();
  let fail = false;
  let tomorrowCalls = 0;
  const reader: ShipPlanningReader = {
    async queryToday() {
      if (fail) throw Object.assign(new Error("timeout"), { status: 0 });
      return dayQuery("2026-10-22", ["HOOFDSTRAAT", "HOOGVELD(I)", "GVI CUIJK"]);
    },
    async queryTomorrow() {
      tomorrowCalls += 1;
      return dayQuery("2026-10-23", ["HOOFDSTRAAT"]);
    },
  };
  const deps = harness(reader, () => new Date("2026-10-22T10:00:00Z"));
  await getShipPlanning("auto", deps);
  fail = true;
  const stale = await getShipPlanning("auto", deps);
  assert.equal(stale.status, "stale");
  assert.equal(stale.switchReason, "stale-today");
  assert.equal(stale.displayedDay, "today");
  assert.equal(stale.todayEmptyConfirmed, false);
  assert.equal(stale.days[0]?.entries.length, 3);
  assert.equal(tomorrowCalls, 0);

  resetShipPlanningCache();
  const incomplete: ShipPlanningReader = {
    async queryToday() {
      return dayQuery("2026-10-22", [], { totalCount: 12, recordCount: 0, complete: false });
    },
    async queryTomorrow() {
      tomorrowCalls += 1;
      return dayQuery("2026-10-23", ["HOOFDSTRAAT"]);
    },
  };
  const partial = await getShipPlanning("auto", harness(incomplete, () => new Date("2026-10-22T10:00:00Z")));
  assert.equal(partial.displayedDay, "today");
  assert.equal(partial.switchReason, "source-unavailable");
  assert.equal(partial.todayEmptyConfirmed, false);
  assert.equal(tomorrowCalls, 0);
  assert.equal(verdictForDay(dayQuery("2026-10-22", [], { totalCount: null, recordCount: 0, complete: true }), "2026-10-22"), "invalid");
});

test("A13 D15 vandaag en morgen leeg", async () => {
  resetShipPlanningCache();
  let todayCalls = 0;
  const reader: ShipPlanningReader = {
    async queryToday() {
      todayCalls += 1;
      return dayQuery("2026-10-22", []);
    },
    async queryTomorrow() {
      return dayQuery("2026-10-23", []);
    },
  };
  const deps = harness(reader, () => new Date("2026-10-22T10:00:00Z"));
  await getShipPlanning("auto", deps);
  const both = await getShipPlanning("auto", deps);
  assert.equal(both.todayEmptyConfirmed, true);
  assert.equal(both.todayRecordCount, 0);
  assert.equal(both.tomorrowRecordCount, 0);
  assert.equal(both.displayedDay, "today");
  assert.equal(both.days.length, 2);
  assert.equal(todayCalls, 2);
});

test("A14 D14 middernacht wist de lege teller en vraagt de nieuwe vandaag", async () => {
  resetShipPlanningCache();
  let now = new Date("2026-10-22T20:00:00Z");
  let tomorrowCalls = 0;
  const reader: ShipPlanningReader = {
    async queryToday(at = now) {
      const hour = at.getTime() >= Date.parse("2026-10-22T22:00:00Z") ? "2026-10-23" : "2026-10-22";
      return dayQuery(hour, hour === "2026-10-22" ? [] : ["HOOFDSTRAAT"]);
    },
    async queryTomorrow() {
      tomorrowCalls += 1;
      return dayQuery("2026-10-24", ["HOOFDSTRAAT"]);
    },
  };
  const deps = harness(reader, () => now);
  const pending = await getShipPlanning("auto", deps);
  assert.equal(pending.displayedDay, "today");
  assert.equal(pending.todayEmptyConfirmed, false);
  now = new Date("2026-10-22T22:30:00Z");
  const rolled = await getShipPlanning("auto", deps);
  assert.equal(rolled.displayedDay, "today");
  assert.equal(rolled.days[0]?.date, "2026-10-23");
  assert.equal(rolled.todayRecordCount, 1);
  assert.equal(tomorrowCalls, 0);
  assert.equal(observeTodayQuery({ date: "2026-10-24", verdict: "empty", confirmationCount: 2 }).confirmed, false);
  resetTodayEmptyConfirmation();
});

test("A15 A16 D9 D10 rotatie laat lege laadplaatsen weg", () => {
  const pages = buildLocationPages(
    [
      { location: "KAMPERGEUL (DEKKER)", entries: [entry("KAMPERGEUL (DEKKER)", 4)] },
      { location: "HOOFDSTRAAT", entries: [entry("HOOFDSTRAAT", 0), entry("HOOFDSTRAAT", 1)] },
      { location: "HOOGVELD(I)", entries: [entry("HOOGVELD(I)", 2)] },
      { location: "TEUNESEN OVERSLAG VENLO", entries: [] },
      { location: "GVI CUIJK", entries: [entry("GVI CUIJK", 3)] },
    ],
    10,
  );
  assert.deepEqual(
    pages.map((page) => page.label),
    ["Hoofdstraat", "Hoogveld", "Venlo", "Cuijk", "KAMPERGEUL (DEKKER)"].filter((label) => label !== "Venlo"),
  );
  const withoutHoogveld = pages.filter((page) => page.location !== "HOOGVELD(I)");
  assert.equal(nextRotationIndex(1, pages, withoutHoogveld), 1);
  assert.equal(withoutHoogveld[1]?.label, "Cuijk");
  assert.equal(buildLocationPages([{ location: "HOOFDSTRAAT", entries: [] }], 8).length, 0);
  assert.equal(nextRotationIndex(0, pages, []), 0);
  assert.equal(nextRotationIndex(1, pages, pages), 1);
  assert.equal(pages[nextRotationIndex(1, pages, pages)]?.location, "HOOGVELD(I)");
  const withoutLast = pages.slice(0, -1);
  assert.equal(nextRotationIndex(pages.length - 1, pages, withoutLast), 0);
  assert.equal(stepLocationIndex(0, pages.length, -1), pages.length - 1);
  assert.equal(stepLocationIndex(pages.length - 1, pages.length, 1), 0);
  assert.equal(stepLocationIndex(1, pages.length, 1), 2);
});

test("A17 geannuleerde records tellen niet als actief", async () => {
  assert.equal(isCancelledEntity({ status: "geannuleerd" }), true);
  assert.equal(isCancelledEntity({ attributes: { status: "Geannuleerd" } }), true);
  const previousUser = process.env.SHIP_PLANNING_USERNAME;
  const previousPass = process.env.SHIP_PLANNING_PASSWORD;
  process.env.SHIP_PLANNING_USERNAME = "service-account";
  process.env.SHIP_PLANNING_PASSWORD = "not-a-real-secret";
  const fetchImpl: typeof fetch = async (input) => {
    if (String(input).endsWith("/authenticate")) {
      return new Response(JSON.stringify({ token: "bearer-test-token" }), { status: 200 });
    }
    return new Response(
      JSON.stringify({
        totalCount: 2,
        entities: [
          {
            entityId: "cancel",
            status: "geannuleerd",
            volgorde: 0,
            laaddatum: amsterdamWallToUtcMs(2026, 10, 22, 8, 0, 0),
            laadplaats: { zoeknaam: "HOOFDSTRAAT" },
          },
          {
            entityId: "keep",
            volgorde: 1,
            laaddatum: amsterdamWallToUtcMs(2026, 10, 22, 9, 0, 0),
            laadplaats: { zoeknaam: "HOOGVELD(I)" },
          },
        ],
      }),
      { status: 200 },
    );
  };
  try {
    const provider = new TeunesenShipPlanningProvider(fetchImpl);
    const query = await provider.queryToday(new Date("2026-10-22T10:00:00Z"));
    assert.equal(query.entries.length, 1);
    assert.equal(query.entries[0]?.loadingLocation, "HOOGVELD(I)");
    assert.equal(mapShipPlanningEntry({ status: "geannuleerd", laadplaats: { zoeknaam: "HOOFDSTRAAT" } }).loadingLocation, "HOOFDSTRAAT");
    assert.equal(verdictForDay({ ...query, entries: [], recordCount: 0, totalCount: 1, complete: true }, query.date), "invalid");
  } finally {
    if (previousUser === undefined) delete process.env.SHIP_PLANNING_USERNAME;
    else process.env.SHIP_PLANNING_USERNAME = previousUser;
    if (previousPass === undefined) delete process.env.SHIP_PLANNING_PASSWORD;
    else process.env.SHIP_PLANNING_PASSWORD = previousPass;
  }
});

test("A11 provider markeert afgekapte pagination als onvolledig", async () => {
  const previousUser = process.env.SHIP_PLANNING_USERNAME;
  const previousPass = process.env.SHIP_PLANNING_PASSWORD;
  process.env.SHIP_PLANNING_USERNAME = "service-account";
  process.env.SHIP_PLANNING_PASSWORD = "not-a-real-secret";
  let queries = 0;
  const fetchImpl: typeof fetch = async (input) => {
    if (String(input).endsWith("/authenticate")) {
      return new Response(JSON.stringify({ token: "bearer-test-token" }), { status: 200 });
    }
    queries += 1;
    return new Response(
      JSON.stringify({
        totalCount: 40,
        continuationToken: "more",
        entities: [{ entityId: `row-${queries}`, volgorde: queries, laadplaats: { zoeknaam: "HOOFDSTRAAT" } }],
      }),
      { status: 200 },
    );
  };
  try {
    const provider = new TeunesenShipPlanningProvider(fetchImpl);
    const query = await provider.queryDate("2026-10-22");
    assert.equal(query.complete, false);
    assert.ok(queries >= 5);
    assert.ok(query.entries.length > 0);
  } finally {
    if (previousUser === undefined) delete process.env.SHIP_PLANNING_USERNAME;
    else process.env.SHIP_PLANNING_USERNAME = previousUser;
    if (previousPass === undefined) delete process.env.SHIP_PLANNING_PASSWORD;
    else process.env.SHIP_PLANNING_PASSWORD = previousPass;
  }
});

test("A18 A19 A20 A21 D1 D16 D17 D18 modi en standaard Auto", async () => {
  const parsed = parseDashboardConfig({
    sharepointDiesel: { siteUrl: "https://teunesen.sharepoint.com/sites/Facturatie", lijstnaam: "Diesel" },
    sharepointNieuws: { siteUrl: "https://teunesen.sharepoint.com/sites/wt-nieuws", bibliotheek: "Sitepagina's" },
    weer: { plaatsnaam: "Gennep" },
    dashboard: { refreshInterval: 300, aantalNieuwsitems: 3 },
    prtg: { groupId: "", tag: "" },
  });
  assert.equal(parsed.shipPlanning.displayMode, "Auto");
  assert.equal(emptyConfirmationCountFromEnv(undefined), 2);
  assert.equal(emptyConfirmationCountFromEnv("2"), 2);
  const hook = readFileSync(path.join(root, "src/services/shipPlanningService.ts"), "utf8");
  assert.match(hook, /if \(mode === "Today"\) return "today"/);
  assert.match(hook, /if \(mode === "Tomorrow"\) return "tomorrow"/);
  assert.match(hook, /if \(mode === "TodayAndTomorrow"\) return "today-and-tomorrow"/);
  assert.match(hook, /return "auto"/);

  resetShipPlanningCache();
  const reader: ShipPlanningReader = {
    async queryToday() {
      return dayQuery("2026-10-22", []);
    },
    async queryTomorrow() {
      return dayQuery("2026-10-23", ["HOOFDSTRAAT"]);
    },
  };
  const now = () => new Date("2026-10-22T10:00:00Z");
  const todayMode = await getShipPlanning("today", harness(reader, now, "Today"));
  assert.equal(todayMode.displayedDay, "today");
  assert.equal(todayMode.switchReason, "manual-override");
  assert.equal(todayMode.todayRecordCount, 0);
  assert.equal(todayMode.tomorrowRecordCount, null);

  resetShipPlanningCache();
  const tomorrowMode = await getShipPlanning("tomorrow", harness(reader, now, "Tomorrow"));
  assert.equal(tomorrowMode.displayedDay, "tomorrow");
  assert.equal(tomorrowMode.switchReason, "manual-override");
  assert.equal(tomorrowMode.days[0]?.date, "2026-10-23");

  resetShipPlanningCache();
  const both = await getShipPlanning("today-and-tomorrow", harness(reader, now, "TodayAndTomorrow"));
  assert.equal(both.switchReason, "manual-override");
  assert.equal(both.days.length, 2);
});

test("D1-D12 titel volgt de getoonde planningdag", () => {
  assert.equal(shipPlanningTitle("2026-10-23"), "Schepenplanning vrijdag 23 oktober");
  assert.equal(shipPlanningTitle("2026-10-26"), "Schepenplanning maandag 26 oktober");
  assert.equal(shipPlanningTitle("2026-10-26").toLowerCase().includes("vandaag"), false);
  assert.equal(shipPlanningTitle("2026-10-26").toLowerCase().includes("morgen"), false);
  assert.equal(shipPlanningTitle("2026-10-23").toLowerCase().includes("morgen"), false);
  const friday = shipPlanningTitle("2026-10-23");
  assert.equal(shipPlanningTitle("2026-10-23"), friday);
  assert.notEqual(shipPlanningTitle("2026-10-23"), shipPlanningTitle("2026-10-26"));
  assert.equal(formatPlanningDate("2026-10-23"), "vrijdag 23 oktober");
  assert.equal(formatPlanningDate("2026-10-26"), "maandag 26 oktober");
  assert.equal(shipPlanningTitle("2026-10-24"), "Schepenplanning zaterdag 24 oktober");
  assert.equal(shipPlanningTitle("2026-10-25"), "Schepenplanning zondag 25 oktober");
  assert.equal(planningTodayMark("2026-10-23", new Date("2026-10-23T12:00:00+02:00")), "Vandaag");
  assert.equal(planningTodayMark("2026-10-26", new Date("2026-10-23T12:00:00+02:00")), null);
  const dates = readFileSync(path.join(root, "src/shipPlanning/amsterdamDate.ts"), "utf8");
  assert.match(dates, /nl-NL/);
  assert.match(dates, /Europe\/Amsterdam/);
  assert.equal(dates.includes("getDay("), false);
  const board = readFileSync(path.join(root, "src/components/ShipPlanningBoard.tsx"), "utf8");
  assert.match(board, /shipPlanningTitle\(day\.date\)/);
  assert.match(board, /planningTodayMark\(day\.date\)/);
  assert.match(board, /--ship-title/);
  assert.match(board, /whitespace-nowrap/);
  assert.equal(board.includes("Schepenplanning vandaag"), false);
  assert.equal(board.includes("Schepenplanning morgen"), false);
  assert.equal(board.includes("setInterval"), false);
});

test("D12 D13 D19 titel, datum en player zonder refresh", () => {
  assert.equal(formatPlanningDate("2026-10-22"), "donderdag 22 oktober");
  assert.equal(formatPlanningDate("2026-10-23"), "vrijdag 23 oktober");
  const board = readFileSync(path.join(root, "src/components/ShipPlanningBoard.tsx"), "utf8");
  assert.match(board, /shipPlanningTitle\(day\.date\)/);
  assert.equal(board.includes("Schepenplanning vandaag"), false);
  assert.equal(board.includes("Schepenplanning morgen"), false);
  assert.match(board, /Planning vandaag afgerond/);
  assert.match(board, /Geen schepen gepland voor vandaag of morgen/);
  assert.match(board, /ship-nav-prev/);
  assert.equal(board.includes("ship-rotation-progress"), false);
  const hook = readFileSync(path.join(root, "src/services/shipPlanningService.ts"), "utf8");
  assert.match(hook, /amsterdamToday/);
  assert.equal(hook.includes("location.reload"), false);
  const player = readFileSync(path.join(root, "src/pages/PlayerPage.tsx"), "utf8");
  assert.match(player, /DashboardCanvas/);
  assert.equal(player.includes("location.reload"), false);
  const ordered = orderLocationGroups([
    { location: "GVI CUIJK", entries: [entry("GVI CUIJK", 2)] },
    { location: "HOOFDSTRAAT", entries: [entry("HOOFDSTRAAT", 0)] },
    { location: "HOOGVELD(I)", entries: [entry("HOOGVELD(I)", 1)] },
    { location: "TEUNESEN OVERSLAG VENLO", entries: [entry("TEUNESEN OVERSLAG VENLO", 3)] },
  ]);
  assert.deepEqual(
    ordered.map((group) => group.label),
    ["Hoofdstraat", "Hoogveld", "Venlo", "Cuijk"],
  );
});

test("D20 dockerfile bouwt de server; runtime alleen wanneer docker aanwezig is", () => {
  const dockerfile = readFileSync(path.join(root, "Dockerfile"), "utf8");
  const compose = readFileSync(path.join(root, "docker-compose.yml"), "utf8");
  assert.match(dockerfile, /npm run build/);
  assert.match(compose, /SHIP_PLANNING_USERNAME/);
  assert.match(compose, /SHIP_PLANNING_PASSWORD/);
});
