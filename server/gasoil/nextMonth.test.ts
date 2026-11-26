import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { isNextGasOilMonthOpen } from "../../src/lib/gasOilMonth.ts";
import { getGasOilSurcharges } from "./gasOilSurchargeService.js";
import { writeGasOilMonthCache } from "./cache.js";
import type { GasOilFetchOutcome, GasOilPriceProvider } from "./providers/gasOilPriceProvider.js";
import { isNextGasOilMonthOpen as serverOpen } from "./monthLogic.js";
import { claimMorningRun, nextMorningCheck, parseMorningClock, releaseMorningRun } from "./morningCheck.js";

function withTempDataDir(run: () => Promise<void>) {
  const dir = mkdtempSync(path.join(tmpdir(), "gasoil-next-"));
  const previous = process.env.DATA_DIR;
  process.env.DATA_DIR = dir;
  return run().finally(() => {
    if (previous === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previous;
    rmSync(dir, { recursive: true, force: true });
  });
}

function provider(country: "NL" | "BE", calls: { count: number }): GasOilPriceProvider {
  return {
    country,
    sourceId: country === "NL" ? "interrijn-cbrb-kbn" : "bestat-statbel",
    sourceLabel: country === "NL" ? "CBRB/KBN via Interrijn" : "be.STAT / FOD Economie",
    async getCurrentObservation(): Promise<GasOilFetchOutcome> {
      calls.count += 1;
      return { ok: false, reason: "geen live bron in deze test" };
    },
  };
}

function month(country: "NL" | "BE", applicableMonth: string, referenceDate: string, price: number) {
  writeGasOilMonthCache({
    country,
    referenceDate,
    applicableMonth,
    rawSourceValue: price / 10,
    priceExVatPer1000Liters: price,
    productIdentifier: "GASOLIEPRIJS (€/100L CBRB)",
    source: country === "NL" ? "interrijn-cbrb-kbn" : "bestat-statbel",
    retrievedAt: "2026-11-15T08:00:00.000Z",
    sourceLabel: country === "NL" ? "CBRB/KBN via Interrijn" : "be.STAT / FOD Economie",
    vatStatus: "excl",
    sourceType: "automatic",
  });
}

test("de 14e toont alleen de actuele maand en vraagt de volgende niet op", async () => {
  await withTempDataDir(async () => {
    month("NL", "2026-11", "2026-10-15", 1642.6);
    month("NL", "2026-12", "2026-11-15", 1700);
    const calls = { count: 0 };
    const payload = await getGasOilSurcharges({
      now: () => new Date("2026-11-14T22:30:00Z"),
      nlProvider: provider("NL", calls),
      beProvider: provider("BE", { count: 0 }),
    });
    assert.equal(payload.nextInquiry, "closed");
    assert.equal(payload.nl.current.applicableMonth, "2026-11");
    assert.equal(payload.nl.current.surchargePerTon, 1.9);
    assert.equal(payload.nl.next.applicableMonth, "2026-12");
    assert.equal(payload.nl.next.surchargePerTon, null);
    assert.notEqual(payload.nl.next.surchargePerTon, 0);
    assert.notEqual(payload.nl.next.priceExVatPer1000Liters, 1700);
    assert.equal(calls.count, 0);
  });
});

test("de 15e toont de volgende maand alleen met een geldige publicatie", async () => {
  await withTempDataDir(async () => {
    month("NL", "2026-11", "2026-10-15", 1642.6);
    const hidden = await getGasOilSurcharges({
      now: () => new Date("2026-11-15T08:00:00+01:00"),
      nlProvider: provider("NL", { count: 0 }),
      beProvider: provider("BE", { count: 0 }),
    });
    assert.equal(hidden.nextInquiry, "open");
    assert.equal(hidden.nl.current.surchargePerTon, 1.9);
    assert.equal(hidden.nl.next.applicableMonth, "2026-12");
    assert.equal(hidden.nl.next.surchargePerTon, null);
    assert.equal(hidden.nl.next.message, "Nog niet vastgesteld");

    month("NL", "2026-12", "2026-11-15", 1700);
    const shown = await getGasOilSurcharges({
      now: () => new Date("2026-11-15T08:00:00+01:00"),
      nlProvider: provider("NL", { count: 0 }),
      beProvider: provider("BE", { count: 0 }),
    });
    assert.equal(shown.nl.next.applicableMonth, "2026-12");
    assert.equal(shown.nl.next.referenceDate, "2026-11-15");
    assert.equal(shown.nl.next.priceExVatPer1000Liters, 1700);
    assert.notEqual(shown.nl.next.surchargePerTon, shown.nl.current.surchargePerTon);
    assert.notEqual(shown.nl.next.surchargePerTon, 0);
  });
});

test("december wijst naar januari en de eerste van de maand laat de oude maand vallen", async () => {
  await withTempDataDir(async () => {
    month("NL", "2026-12", "2026-11-15", 1700);
    month("NL", "2027-01", "2026-12-15", 1800);
    const december = await getGasOilSurcharges({
      now: () => new Date("2026-12-15T12:00:00+01:00"),
      nlProvider: provider("NL", { count: 0 }),
      beProvider: provider("BE", { count: 0 }),
    });
    assert.equal(december.nextInquiry, "open");
    assert.equal(december.nl.current.applicableMonth, "2026-12");
    assert.equal(december.nl.next.applicableMonth, "2027-01");
    assert.equal(december.nl.next.referenceDate, "2026-12-15");
    assert.notEqual(december.nl.next.priceExVatPer1000Liters, 1700);

    const newYear = await getGasOilSurcharges({
      now: () => new Date("2027-01-01T00:30:00+01:00"),
      nlProvider: provider("NL", { count: 0 }),
      beProvider: provider("BE", { count: 0 }),
    });
    assert.equal(newYear.nextInquiry, "closed");
    assert.equal(newYear.nl.current.applicableMonth, "2027-01");
    assert.equal(newYear.nl.current.priceExVatPer1000Liters, 1800);
    assert.equal(newYear.nl.next.applicableMonth, "2027-02");
    assert.equal(newYear.nl.next.surchargePerTon, null);
    assert.notEqual(newYear.nl.next.priceExVatPer1000Liters, 1700);
  });
});

test("een bronfout houdt de laatst geldige actuele toeslag", async () => {
  await withTempDataDir(async () => {
    month("NL", "2026-11", "2026-10-15", 1642.6);
    const payload = await getGasOilSurcharges({
      now: () => new Date("2026-11-20T12:00:00+01:00"),
      forceRefresh: true,
      nlProvider: provider("NL", { count: 0 }),
      beProvider: provider("BE", { count: 0 }),
    });
    assert.equal(payload.nl.current.status, "stale");
    assert.equal(payload.nl.current.surchargePerTon, 1.9);
    assert.equal(payload.nl.next.surchargePerTon, null);
  });
});

test("de 15e-regel en de ochtendklok gebruiken Europe/Amsterdam, ook rond zomertijd", () => {
  const fourteenth = new Date("2026-11-14T22:30:00Z");
  const fifteenth = new Date("2026-11-14T23:30:00Z");
  assert.equal(serverOpen(fourteenth), false);
  assert.equal(isNextGasOilMonthOpen(fourteenth), false);
  assert.equal(serverOpen(fifteenth), true);
  assert.equal(isNextGasOilMonthOpen(fifteenth), true);
  assert.equal(parseMorningClock(undefined)?.hour, 6);
  assert.equal(parseMorningClock("off"), null);

  assert.equal(nextMorningCheck(new Date("2026-01-15T04:59:00Z"), { hour: 6, minute: 0 }).toISOString(), "2026-01-15T05:00:00.000Z");
  assert.equal(nextMorningCheck(new Date("2026-07-15T03:59:00Z"), { hour: 6, minute: 0 }).toISOString(), "2026-07-15T04:00:00.000Z");
  assert.equal(nextMorningCheck(new Date("2026-03-29T03:59:00Z"), { hour: 6, minute: 0 }).toISOString(), "2026-03-29T04:00:00.000Z");
  assert.equal(nextMorningCheck(new Date("2026-10-25T04:59:00Z"), { hour: 6, minute: 0 }).toISOString(), "2026-10-25T05:00:00.000Z");
});

test("de ochtendcontrole claimt een dag één keer", async () => {
  await withTempDataDir(async () => {
    assert.equal(claimMorningRun("2026-11-26"), true);
    assert.equal(claimMorningRun("2026-11-26"), false);
    releaseMorningRun("2026-11-26");
    assert.equal(claimMorningRun("2026-11-26"), true);
    assert.equal(claimMorningRun("2026-11-27"), true);
  });
});
