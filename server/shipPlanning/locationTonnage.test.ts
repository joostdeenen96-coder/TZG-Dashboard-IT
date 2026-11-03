import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { groupEntries } from "../../src/shipPlanning/groupEntries.ts";
import {
  formatShipCount,
  formatShipLocationMeta,
  formatTons,
  locationQuantity,
} from "../../src/shipPlanning/locationTonnage.ts";
import { buildLocationPages, entriesForDisplayedLoadDay, stepLocationIndex } from "../../src/shipPlanning/rotation.ts";
import type { ShipPlanningEntry } from "../../src/types/shipPlanning.ts";
import { amsterdamWallToUtcMs } from "./dates.js";

const root = path.resolve(import.meta.dirname, "../..");

function entry(partial: Partial<ShipPlanningEntry> & Pick<ShipPlanningEntry, "loadingLocation" | "sourceOrder">): ShipPlanningEntry {
  return {
    sourceId: partial.sourceId ?? null,
    sourceOrder: partial.sourceOrder,
    loadingLocation: partial.loadingLocation,
    loadingAt: "loadingAt" in partial ? (partial.loadingAt ?? null) : amsterdamWallToUtcMs(2026, 10, 27, 8, 0, 0),
    time: partial.time ?? "08:00",
    customer: partial.customer ?? "Klant",
    unloadingLocation: partial.unloadingLocation ?? "Loskade",
    condition: partial.condition ?? "nat",
    product: partial.product ?? "zand",
    quantity: partial.quantity === undefined ? 100 : partial.quantity,
    quantityUnit: partial.quantityUnit ?? null,
    vessel: partial.vessel ?? "Schip",
    orderNumber: partial.orderNumber ?? null,
    carrier: partial.carrier ?? null,
    phoneNumber: partial.phoneNumber ?? null,
    unloadingDate: partial.unloadingDate ?? null,
    planningRemark: partial.planningRemark ?? null,
  };
}

function pagesFor(entries: ShipPlanningEntry[], day = "2026-10-27") {
  const visible = entriesForDisplayedLoadDay(entries, day);
  return buildLocationPages(groupEntries(visible), 6);
}

test("TON1-TON9 tonnage, grammatica en ontbrekende hoeveelheid", () => {
  assert.equal(formatShipLocationMeta(1, locationQuantity([850])), "1 schip · 850 ton");
  assert.equal(formatShipCount(1), "1 schip");

  const several = locationQuantity([350, 1200, 2100, 800]);
  assert.equal(several.total, 4450);
  assert.equal(formatShipLocationMeta(4, several), "4 schepen · 4.450 ton");
  assert.equal(formatShipCount(5), "5 schepen");
  assert.equal(formatShipCount(8), "8 schepen");
  assert.equal(formatTons(1250, 0), "1.250 ton");
  assert.equal(formatTons(6450, 0), "6.450 ton");
  assert.equal(formatTons(6450, 0).includes(","), false);

  const withGap = locationQuantity([350, null, Number.NaN, undefined, Number.POSITIVE_INFINITY, 1200]);
  assert.equal(withGap.total, 1550);
  assert.equal(formatShipLocationMeta(6, withGap), "6 schepen · 1.550 ton");

  const unknown = locationQuantity([null, Number.NaN, undefined]);
  assert.equal(unknown.total, null);
  assert.equal(formatShipLocationMeta(3, unknown), "3 schepen · Tonnage niet beschikbaar");
  assert.equal(formatShipLocationMeta(3, unknown).includes("0 ton"), false);

  const decimal = locationQuantity([1000, 12.5, 0.25]);
  assert.equal(decimal.total, 1012.75);
  assert.equal(formatTons(decimal.total ?? 0, decimal.fractionDigits), "1.012,75 ton");
});

test("TON10-TON15 alleen zichtbare laadrecords van de actieve laadplaats, ook na refresh", () => {
  const day = "2026-10-27";
  const entries = [
    entry({ loadingLocation: "HOOFDSTRAAT", sourceOrder: 1, quantity: 350, sourceId: "a" }),
    entry({ loadingLocation: "HOOFDSTRAAT", sourceOrder: 2, quantity: 1200, sourceId: "b" }),
    entry({ loadingLocation: "HOOFDSTRAAT", sourceOrder: 3, quantity: 2100, sourceId: "c" }),
    entry({ loadingLocation: "HOOFDSTRAAT", sourceOrder: 4, quantity: 800, sourceId: "d" }),
    entry({
      loadingLocation: "HOOFDSTRAAT",
      sourceOrder: 5,
      quantity: 9999,
      sourceId: "other-day",
      loadingAt: amsterdamWallToUtcMs(2026, 10, 28, 8, 0, 0),
    }),
    entry({
      loadingLocation: "HOOFDSTRAAT",
      sourceOrder: 6,
      quantity: 5000,
      sourceId: "unload-only",
      loadingAt: null,
      unloadingDate: day,
    }),
    entry({ loadingLocation: "HOOGVELD(I)", sourceOrder: 1, quantity: 700, sourceId: "h1" }),
    entry({ loadingLocation: "HOOGVELD(I)", sourceOrder: 2, quantity: 800, sourceId: "h2" }),
    entry({ loadingLocation: "HOOGVELD(I)", sourceOrder: 3, quantity: 600, sourceId: "h3" }),
    entry({ loadingLocation: "GVI CUIJK", sourceOrder: 1, quantity: 4800, sourceId: "c1" }),
  ];
  const pages = pagesFor(entries, day);
  const hoofd = pages.filter((page) => page.location === "HOOFDSTRAAT");
  const hoog = pages.filter((page) => page.location === "HOOGVELD(I)");
  const cuijk = pages.filter((page) => page.location === "GVI CUIJK");
  assert.equal(hoofd[0]?.locationQuantity, 4450);
  assert.equal(hoofd[0]?.locationCount, 4);
  assert.equal(hoog[0]?.locationQuantity, 2100);
  assert.equal(hoog[0]?.locationCount, 3);
  assert.equal(cuijk[0]?.locationQuantity, 4800);
  assert.equal(
    formatShipLocationMeta(hoofd[0]!.locationCount, {
      total: hoofd[0]!.locationQuantity,
      fractionDigits: hoofd[0]!.locationQuantityFractionDigits,
    }),
    "4 schepen · 4.450 ton",
  );

  const nextIndex = stepLocationIndex(0, pages.length, 1);
  const stepped = pages[nextIndex];
  assert.notEqual(stepped?.location, pages[0]?.location);
  assert.notEqual(stepped?.locationQuantity, pages[0]?.locationQuantity);

  const refreshed = pagesFor(
    entries.filter((item) => item.sourceId !== "c"),
    day,
  );
  assert.equal(refreshed.find((page) => page.location === "HOOFDSTRAAT")?.locationQuantity, 2350);
  assert.equal(refreshed.find((page) => page.location === "HOOFDSTRAAT")?.locationCount, 3);
});

test("TON14-TON18 paginering, kolommen en pijlen laten het laadplaatstotaal staan", () => {
  const quantities = [1000, 1000, 1000, 1000, 1000, 1000, 750, 750, 750, 750, 750, 750];
  const entries = quantities.map((quantity, index) =>
    entry({
      loadingLocation: "HOOFDSTRAAT",
      sourceOrder: index,
      quantity,
      sourceId: `p-${index}`,
      loadingAt: amsterdamWallToUtcMs(2026, 10, 27, 6 + Math.floor(index / 2), (index % 2) * 30, 0),
    }),
  );
  const pages = pagesFor(entries);
  assert.equal(pages.length, 1);
  assert.equal(pages[0]?.columns, 2);
  assert.equal(pages[0]?.locationCount, 12);
  assert.equal(pages[0]?.locationQuantity, 10500);
  const visiblePageSum = [...pages[0]!.left, ...pages[0]!.right].reduce((sum, item) => sum + (item.quantity ?? 0), 0);
  assert.equal(visiblePageSum, 10500);

  const eighteen = Array.from({ length: 18 }, (_, index) =>
    entry({
      loadingLocation: "HOOFDSTRAAT",
      sourceOrder: index,
      quantity: index < 12 ? 500 : 250,
      sourceId: `e-${index}`,
    }),
  );
  const splitPages = pagesFor(eighteen);
  assert.equal(splitPages.length, 2);
  assert.equal(splitPages[0]?.columns, 2);
  assert.equal(splitPages[1]?.columns, 1);
  assert.equal(splitPages[0]?.locationQuantity, 7500);
  assert.equal(splitPages[1]?.locationQuantity, 7500);
  const firstPageSum = [...splitPages[0]!.left, ...splitPages[0]!.right].reduce((sum, item) => sum + (item.quantity ?? 0), 0);
  assert.equal(firstPageSum, 6000);
  assert.notEqual(firstPageSum, splitPages[0]?.locationQuantity);

  const few = pagesFor([
    entry({ loadingLocation: "HOOGVELD(I)", sourceOrder: 1, quantity: 400 }),
    entry({ loadingLocation: "HOOGVELD(I)", sourceOrder: 2, quantity: 450 }),
  ]);
  assert.equal(few.length, 1);
  assert.equal(few[0]?.columns, 1);
  assert.equal(few[0]?.locationQuantity, 850);
  assert.equal(formatShipLocationMeta(few[0]!.locationCount, { total: few[0]!.locationQuantity, fractionDigits: 0 }), "2 schepen · 850 ton");

  const board = readFileSync(path.join(root, "src/components/ShipPlanningBoard.tsx"), "utf8");
  const dialog = readFileSync(path.join(root, "src/components/ShipPlanningDetailDialog.tsx"), "utf8");
  const query = readFileSync(path.join(root, "server/shipPlanning/pluginQuery.ts"), "utf8");
  assert.match(board, /ship-nav-prev/);
  assert.match(board, /ship-nav-next/);
  assert.match(board, /stepLocationIndex/);
  assert.match(board, /displayedPlanningDate/);
  assert.match(board, /entriesForDisplayedLoadDay/);
  assert.match(board, /formatShipLocationMeta/);
  assert.match(board, /data-ship-tonnage=/);
  assert.equal(dialog.includes("formatShipLocationMeta"), false);
  assert.equal(dialog.includes("locationQuantity"), false);
  assert.match(query, /SHIP_PLANNING_ENTITY_TYPE_ID = 255/);
});

test("TON19-TON22 header blijft één regel en volgt de getoonde planningdag", () => {
  const board = readFileSync(path.join(root, "src/components/ShipPlanningBoard.tsx"), "utf8");
  const css = readFileSync(path.join(root, "src/index.css"), "utf8");
  assert.match(board, /whitespace-nowrap/);
  assert.match(board, /data-ship-location-bar/);
  assert.match(css, /\[data-ship-count\][\s\S]*white-space:\s*nowrap/);
  assert.match(css, /--font-meta:\s*clamp\(11px, 1\.02vh, 15px\)/);
  assert.equal(board.includes("grid-template-rows"), false);

  const longName = "OVERSLAGTERMINAL LANGS DE MAAS";
  const longEntries = Array.from({ length: 12 }, (_, index) =>
    entry({ loadingLocation: longName, sourceOrder: index, quantity: 1062.5, sourceId: `v-${index}` }),
  );
  const longPages = pagesFor(longEntries);
  assert.equal(longPages[0]?.label, longName);
  assert.equal(longPages[0]?.locationCount, 12);
  assert.equal(
    formatShipLocationMeta(12, {
      total: longPages[0]!.locationQuantity,
      fractionDigits: longPages[0]!.locationQuantityFractionDigits,
    }),
    "12 schepen · 12.750 ton",
  );
});
