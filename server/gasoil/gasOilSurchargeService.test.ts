import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { getGasOilProviderHealth, getGasOilSurcharges } from "./gasOilSurchargeService.js";
import type { GasOilPriceObservation } from "./model.js";
import { writeGasOilCache } from "./cache.js";
import type { GasOilFetchOutcome, GasOilPriceProvider } from "./providers/gasOilPriceProvider.js";
import { NOVEMBER_2026_FIXTURE } from "./providers/belgiumStatbelGasOilProvider.js";

function withTempDataDir(run: () => Promise<void>) {
  const dir = mkdtempSync(path.join(tmpdir(), "gasoil-"));
  const previous = process.env.DATA_DIR;
  process.env.DATA_DIR = dir;
  return run().finally(() => {
    if (previous === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previous;
    rmSync(dir, { recursive: true, force: true });
  });
}

function mockProvider(
  country: "NL" | "BE",
  sourceId: "interrijn-cbrb-kbn" | "bestat-statbel",
  sourceLabel: string,
  outcome: GasOilFetchOutcome | (() => Promise<GasOilFetchOutcome>),
): GasOilPriceProvider {
  return {
    country,
    sourceId,
    sourceLabel,
    async getCurrentObservation() {
      return typeof outcome === "function" ? outcome() : outcome;
    },
  };
}

test("NL unavailable zonder cache toont geen 0-toeslag", async () => {
  await withTempDataDir(async () => {
    const payload = await getGasOilSurcharges({
      now: () => new Date("2026-11-05T12:00:00+01:00"),
      nlProvider: mockProvider("NL", "interrijn-cbrb-kbn", "CBRB/KBN via Interrijn", {
        ok: false,
        reason: "Interrijn-parser is nog niet gevalideerd",
      }),
      beProvider: mockProvider("BE", "bestat-statbel", "be.STAT", {
        ok: false,
        reason: "be.STAT uit",
      }),
    });
    assert.equal(payload.nl.status, "unavailable");
    assert.equal(payload.nl.surchargePerTon, null);
    assert.equal(payload.nl.priceExVatPer1000Liters, null);
    assert.notEqual(payload.nl.surchargePerTon, 0);
  });
});

test("NL stale alleen na eerder geldige cache", async () => {
  await withTempDataDir(async () => {
    const observation: GasOilPriceObservation = {
      country: "NL",
      referenceDate: "2026-10-15",
      applicableMonth: "2026-11",
      priceExVatPer1000Liters: 1642.6,
      source: "interrijn-cbrb-kbn",
      sourceLabel: "CBRB/KBN via Interrijn",
      retrievedAt: "2026-10-16T10:00:00.000Z",
    };
    writeGasOilCache(observation);
    const payload = await getGasOilSurcharges({
      now: () => new Date("2026-11-05T12:00:00+01:00"),
      nlProvider: mockProvider("NL", "interrijn-cbrb-kbn", "CBRB/KBN via Interrijn", {
        ok: false,
        reason: "timeout",
      }),
      beProvider: mockProvider("BE", "bestat-statbel", "be.STAT", { ok: false, reason: "skip" }),
    });
    assert.equal(payload.nl.status, "stale");
    assert.equal(payload.nl.surchargePerTon, 1.9);
    assert.match(payload.nl.message ?? "", /timeout|Laatst/i);
  });
});

test("BE novemberfixture via provider observation -> 0.96", async () => {
  await withTempDataDir(async () => {
    const payload = await getGasOilSurcharges({
      now: () => new Date("2026-11-05T12:00:00+01:00"),
      nlProvider: mockProvider("NL", "interrijn-cbrb-kbn", "CBRB/KBN via Interrijn", {
        ok: false,
        reason: "skip",
      }),
      beProvider: mockProvider("BE", "bestat-statbel", "be.STAT", {
        ok: true,
        observation: {
          country: "BE",
          referenceDate: NOVEMBER_2026_FIXTURE.referenceDate,
          applicableMonth: NOVEMBER_2026_FIXTURE.applicableMonth,
          priceExVatPer1000Liters: NOVEMBER_2026_FIXTURE.priceExVatPer1000Liters,
          source: "bestat-statbel",
          sourceLabel: "be.STAT",
          retrievedAt: "2026-10-21T12:00:00.000Z",
          productLabel: NOVEMBER_2026_FIXTURE.product,
        },
      }),
    });
    assert.equal(payload.be.status, "ready");
    assert.equal(payload.be.surchargePerTon, 0.96);
    assert.equal(payload.be.priceExVatPer1000Liters, 1294.7);
  });
});

test("geen Teunesen.nl runtime requests vanuit providers in deze suite", async () => {
  await withTempDataDir(async () => {
    const requested: string[] = [];
    await getGasOilSurcharges({
      now: () => new Date("2026-11-05T12:00:00+01:00"),
      nlProvider: mockProvider("NL", "interrijn-cbrb-kbn", "CBRB/KBN via Interrijn", async () => {
        requested.push("https://www.interrijn.com/nl/");
        return { ok: false, reason: "unvalidated" };
      }),
      beProvider: mockProvider("BE", "bestat-statbel", "be.STAT", async () => {
        requested.push("https://bestat.statbel.fgov.be/...");
        return { ok: false, reason: "skip" };
      }),
    });
    assert.equal(requested.some((url) => url.includes("teunesen.nl")), false);
  });
});

test("NL herstel na storing schrijft verse ready-waarde", async () => {
  await withTempDataDir(async () => {
    writeGasOilCache({
      country: "NL",
      referenceDate: "2026-09-15",
      applicableMonth: "2026-10",
      priceExVatPer1000Liters: 1686.5,
      source: "interrijn-cbrb-kbn",
      sourceLabel: "CBRB/KBN via Interrijn",
      retrievedAt: "2026-09-16T10:00:00.000Z",
    });
    const payload = await getGasOilSurcharges({
      now: () => new Date("2026-11-05T12:00:00+01:00"),
      nlProvider: mockProvider("NL", "interrijn-cbrb-kbn", "CBRB/KBN via Interrijn", {
        ok: true,
        observation: {
          country: "NL",
          referenceDate: "2026-10-15",
          applicableMonth: "2026-11",
          priceExVatPer1000Liters: 1642.6,
          source: "interrijn-cbrb-kbn",
          sourceLabel: "CBRB/KBN via Interrijn",
          retrievedAt: "2026-10-16T10:00:00.000Z",
        },
      }),
      beProvider: mockProvider("BE", "bestat-statbel", "be.STAT", { ok: false, reason: "skip" }),
    });
    assert.equal(payload.nl.status, "ready");
    assert.equal(payload.nl.surchargePerTon, 1.9);
  });
});

test("health gasoil bronnen: unavailable/stale zonder server-unhealthy te forceren", async () => {
  await withTempDataDir(async () => {
    const health = await getGasOilProviderHealth({
      now: () => new Date("2026-11-05T12:00:00+01:00"),
      nlProvider: mockProvider("NL", "interrijn-cbrb-kbn", "CBRB/KBN via Interrijn", {
        ok: false,
        reason: "down",
      }),
      beProvider: mockProvider("BE", "bestat-statbel", "be.STAT", { ok: false, reason: "down" }),
    });
    assert.equal(health.find((row) => row.id === "interrijnCbrb")?.status, "unavailable");
    assert.equal(health.find((row) => row.id === "statbelGasOil")?.status, "unavailable");
  });
});
