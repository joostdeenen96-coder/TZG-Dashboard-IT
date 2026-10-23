import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { getGasOilProviderHealth, getGasOilSurcharges } from "./gasOilSurchargeService.js";
import type { GasOilPriceObservation } from "./model.js";
import { readGasOilMonthCache, writeGasOilCache, writeGasOilMonthCache } from "./cache.js";
import type { GasOilFetchOutcome, GasOilPriceProvider } from "./providers/gasOilPriceProvider.js";
import {
  BELGIUM_PRODUCT,
  BelgiumStatbelGasOilProvider,
  NOVEMBER_2026_FIXTURE,
  OCTOBER_2026_FIXTURE,
} from "./providers/belgiumStatbelGasOilProvider.js";

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

const historyFixtureJson = JSON.stringify({
  facts: [
    {
      Dag: "15sep26",
      Product: BELGIUM_PRODUCT,
      "Prijs incl. BTW": OCTOBER_2026_FIXTURE.priceInclPerLiter,
    },
    {
      Dag: "15okt26",
      Product: BELGIUM_PRODUCT,
      "Prijs incl. BTW": NOVEMBER_2026_FIXTURE.priceInclPerLiter,
    },
  ],
});

const dayFixtureOtherDate = JSON.stringify({
  facts: [
    {
      Product: BELGIUM_PRODUCT,
      Dag: "22okt26",
      "Prijs excl. BTW": 1.276,
      "Prijs incl. BTW": 1.544,
    },
  ],
});

test("NL unavailable zonder cache toont geen 0-toeslag", async () => {
  await withTempDataDir(async () => {
    const payload = await getGasOilSurcharges({
      now: () => new Date("2026-11-05T12:00:00+01:00"),
      nlProvider: mockProvider("NL", "interrijn-cbrb-kbn", "CBRB/KBN via Interrijn", {
        ok: false,
        reason: "Interrijn-parser is nog niet gevalideerd",
      }),
      beProvider: mockProvider("BE", "bestat-statbel", "be.STAT / FOD Economie", {
        ok: false,
        reason: "be.STAT uit",
      }),
    });
    assert.equal(payload.nl.status, "unavailable");
    assert.equal(payload.nl.applicableMonth, "2026-11");
    assert.equal(payload.nl.current.applicableMonth, "2026-11");
    assert.equal(payload.nl.surchargePerTon, null);
    assert.equal(payload.nl.referenceDate, null);
    assert.equal(payload.nl.priceExVatPer1000Liters, null);
    assert.notEqual(payload.nl.surchargePerTon, 0);
    assert.equal(payload.nl.next.applicableMonth, "2026-12");
    assert.equal(payload.nl.next.surchargePerTon, null);
    assert.equal(payload.be.current.applicableMonth, "2026-11");
    assert.equal(payload.be.current.surchargePerTon, null);
    assert.equal(payload.be.next.applicableMonth, "2026-12");
    assert.equal(payload.be.next.message, "Nog niet vastgesteld");
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
      beProvider: mockProvider("BE", "bestat-statbel", "be.STAT / FOD Economie", { ok: false, reason: "skip" }),
    });
    assert.equal(payload.nl.status, "stale");
    assert.equal(payload.nl.surchargePerTon, 1.9);
    assert.match(payload.nl.message ?? "", /timeout|Laatst/i);
  });
});

test("BE novemberfixture via provider observation -> 0.96 + product veld", async () => {
  await withTempDataDir(async () => {
    const payload = await getGasOilSurcharges({
      now: () => new Date("2026-11-05T12:00:00+01:00"),
      nlProvider: mockProvider("NL", "interrijn-cbrb-kbn", "CBRB/KBN via Interrijn", {
        ok: false,
        reason: "skip",
      }),
      beProvider: mockProvider("BE", "bestat-statbel", "be.STAT / FOD Economie", {
        ok: true,
        observation: {
          country: "BE",
          referenceDate: NOVEMBER_2026_FIXTURE.referenceDate,
          applicableMonth: NOVEMBER_2026_FIXTURE.applicableMonth,
          priceExVatPer1000Liters: NOVEMBER_2026_FIXTURE.priceExVatPer1000Liters,
          source: "bestat-statbel",
          sourceLabel: "be.STAT / FOD Economie",
          retrievedAt: "2026-10-21T12:00:00.000Z",
          productLabel: NOVEMBER_2026_FIXTURE.product,
        },
      }),
    });
    assert.equal(payload.be.status, "ok");
    assert.equal(payload.be.surchargePerTon, 0.96);
    assert.equal(payload.be.priceExVatPer1000Liters, 1294.7);
    assert.equal(payload.be.product, NOVEMBER_2026_FIXTURE.product);
    assert.equal(payload.be.source, "bestat-statbel");
  });
});

test("BE maandcache: geen herhaalde fetch + stale bij bronstoring", async () => {
  await withTempDataDir(async () => {
    let fetches = 0;
    const provider = new BelgiumStatbelGasOilProvider({
      fetchText: async (url) => {
        fetches += 1;
        if (fetches > 2) throw new Error("bronstoring");
        return url.includes("c42c9c16") ? dayFixtureOtherDate : historyFixtureJson;
      },
      now: () => new Date("2026-10-21T12:00:00+02:00"),
    });

    const first = await getGasOilSurcharges({
      now: () => new Date("2026-10-21T12:00:00+02:00"),
      forceRefresh: true,
      nlProvider: mockProvider("NL", "interrijn-cbrb-kbn", "CBRB/KBN via Interrijn", {
        ok: false,
        reason: "skip",
      }),
      beProvider: provider,
    });
    assert.equal(first.be.status, "ok");
    assert.equal(first.be.referenceDate, "2026-09-15");
    assert.equal(first.be.priceExVatPer1000Liters, 1262.3);
    assert.equal(first.be.surchargePerTon, 0.93);
    const cachedMonth = readGasOilMonthCache("BE", "2026-10");
    assert.ok(cachedMonth);
    assert.equal(cachedMonth!.rawSourceValue, 1.5274);

    const fetchesAfterFirst = fetches;
    const second = await getGasOilSurcharges({
      now: () => new Date("2026-10-21T12:00:00+02:00"),
      forceRefresh: false,
      nlProvider: mockProvider("NL", "interrijn-cbrb-kbn", "CBRB/KBN via Interrijn", {
        ok: false,
        reason: "skip",
      }),
      beProvider: provider,
    });
    assert.equal(second.be.status, "ok");
    assert.equal(second.be.priceExVatPer1000Liters, 1262.3);
    // Month cache hit: no additional history/day fetch for current month.
    // Prefetch of November may still run once if not cached.
    assert.ok(fetches <= fetchesAfterFirst + 2);

    const stale = await getGasOilSurcharges({
      now: () => new Date("2026-10-21T12:00:00+02:00"),
      forceRefresh: true,
      nlProvider: mockProvider("NL", "interrijn-cbrb-kbn", "CBRB/KBN via Interrijn", {
        ok: false,
        reason: "skip",
      }),
      beProvider: provider,
    });
    assert.equal(stale.be.status, "stale");
    assert.equal(stale.be.priceExVatPer1000Liters, 1262.3);
  });
});

test("ongeldige nieuwe data overschrijft geldige maandcache niet", async () => {
  await withTempDataDir(async () => {
    writeGasOilMonthCache({
      country: "BE",
      referenceDate: "2026-09-15",
      applicableMonth: "2026-10",
      rawSourceValue: 1.5274,
      priceExVatPer1000Liters: 1262.3,
      productIdentifier: BELGIUM_PRODUCT,
      source: "bestat-statbel",
      retrievedAt: "2026-10-16T10:00:00.000Z",
      sourceLabel: "be.STAT / FOD Economie",
      vatStatus: "incl-converted",
    });
    const wrote = writeGasOilMonthCache({
      country: "BE",
      referenceDate: "2026-09-15",
      applicableMonth: "2026-10",
      rawSourceValue: Number.NaN,
      priceExVatPer1000Liters: Number.NaN,
      productIdentifier: BELGIUM_PRODUCT,
      source: "bestat-statbel",
      retrievedAt: "2026-10-21T10:00:00.000Z",
      sourceLabel: "be.STAT / FOD Economie",
      vatStatus: "incl-converted",
    });
    assert.equal(wrote, false);
    const cached = readGasOilMonthCache("BE", "2026-10");
    assert.equal(cached?.priceExVatPer1000Liters, 1262.3);
  });
});

test("NL unavailable beïnvloedt BE niet", async () => {
  await withTempDataDir(async () => {
    const provider = new BelgiumStatbelGasOilProvider({
      fetchText: async (url) => (url.includes("c42c9c16") ? dayFixtureOtherDate : historyFixtureJson),
      now: () => new Date("2026-10-21T12:00:00+02:00"),
    });
    const payload = await getGasOilSurcharges({
      now: () => new Date("2026-10-21T12:00:00+02:00"),
      forceRefresh: true,
      nlProvider: mockProvider("NL", "interrijn-cbrb-kbn", "CBRB/KBN via Interrijn", {
        ok: false,
        reason: "Interrijn niet gevalideerd",
      }),
      beProvider: provider,
    });
    assert.equal(payload.nl.status, "unavailable");
    assert.equal(payload.be.status, "ok");
    assert.equal(payload.be.surchargePerTon, 0.93);
  });
});

test("development diagnostics zonder credentials/stacktraces", async () => {
  await withTempDataDir(async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    try {
      const provider = new BelgiumStatbelGasOilProvider({
        fetchText: async (url) => (url.includes("c42c9c16") ? dayFixtureOtherDate : historyFixtureJson),
        now: () => new Date("2026-10-21T12:00:00+02:00"),
      });
      const payload = await getGasOilSurcharges({
        now: () => new Date("2026-10-21T12:00:00+02:00"),
        forceRefresh: true,
        nlProvider: mockProvider("NL", "interrijn-cbrb-kbn", "CBRB/KBN via Interrijn", {
          ok: false,
          reason: "skip",
        }),
        beProvider: provider,
      });
      assert.ok(payload.diagnostics?.be);
      assert.equal(payload.diagnostics!.be.referenceDate, "2026-09-15");
      assert.equal(payload.diagnostics!.be.productIdentifier, BELGIUM_PRODUCT);
      assert.equal(payload.diagnostics!.be.unit, "EUR/L");
      assert.equal(payload.diagnostics!.be.vatStatus, "incl-converted");
      assert.ok(payload.diagnostics!.be.sourceRecord);
      const blob = JSON.stringify(payload.diagnostics);
      assert.equal(blob.includes("password"), false);
      assert.equal(blob.includes("stack"), false);
    } finally {
      if (previous === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previous;
    }
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
      beProvider: mockProvider("BE", "bestat-statbel", "be.STAT / FOD Economie", async () => {
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
      beProvider: mockProvider("BE", "bestat-statbel", "be.STAT / FOD Economie", { ok: false, reason: "skip" }),
    });
    assert.equal(payload.nl.status, "ok");
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
      beProvider: mockProvider("BE", "bestat-statbel", "be.STAT / FOD Economie", { ok: false, reason: "down" }),
    });
    assert.equal(health.find((row) => row.id === "interrijnCbrb")?.status, "unavailable");
    assert.equal(health.find((row) => row.id === "statbelGasOil")?.status, "unavailable");
  });
});

test("G1–G8 BE en NL tonen huidige en volgende maand zonder verzonnen toeslag", async () => {
  await withTempDataDir(async () => {
    const be = new BelgiumStatbelGasOilProvider({
      fetchText: async (url) => (url.includes("c42c9c16") ? dayFixtureOtherDate : historyFixtureJson),
      now: () => new Date("2026-10-23T12:00:00+02:00"),
    });
    const october = await getGasOilSurcharges({
      now: () => new Date("2026-10-23T12:00:00+02:00"),
      forceRefresh: true,
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
      beProvider: be,
    });
    assert.equal(october.be.applicableMonth, "2026-10");
    assert.equal(october.be.current.applicableMonth, "2026-10");
    assert.equal(october.be.current.surchargePerTon, 0.93);
    assert.equal(october.be.next.applicableMonth, "2026-11");
    assert.equal(october.be.next.surchargePerTon, 0.96);
    assert.equal(october.be.next.referenceDate, "2026-10-15");
    assert.equal(october.nl.current.applicableMonth, "2026-11");
    assert.equal(october.nl.current.surchargePerTon, 1.9);
    assert.equal(october.nl.next.applicableMonth, "2026-12");
    assert.equal(october.nl.next.status, "unavailable");
    assert.equal(october.nl.next.surchargePerTon, null);
    assert.equal(october.nl.next.priceExVatPer1000Liters, null);
    assert.equal(october.nl.next.referenceDate, null);
    assert.notEqual(october.nl.next.surchargePerTon, 0);
    assert.equal(october.nl.next.message, "Nog niet vastgesteld");

    const november = await getGasOilSurcharges({
      now: () => new Date("2026-11-01T00:30:00+01:00"),
      forceRefresh: true,
      nlProvider: mockProvider("NL", "interrijn-cbrb-kbn", "CBRB/KBN via Interrijn", { ok: false, reason: "skip" }),
      beProvider: be,
    });
    assert.equal(november.be.current.applicableMonth, "2026-11");
    assert.equal(november.be.current.surchargePerTon, 0.96);
    assert.equal(november.be.next.applicableMonth, "2026-12");
    assert.equal(november.be.next.surchargePerTon, null);
    assert.equal(november.be.next.referenceDate, null);
    assert.notEqual(november.be.next.surchargePerTon, 0);
    assert.equal(november.be.next.message, "Nog niet vastgesteld");
  });
});

test("volgende NL-maand komt uit de maandcache en niet uit de dagobservatie", async () => {
  await withTempDataDir(async () => {
    writeGasOilMonthCache({
      country: "NL",
      referenceDate: "2026-11-15",
      applicableMonth: "2026-12",
      rawSourceValue: 170,
      priceExVatPer1000Liters: 1700,
      productIdentifier: "GASOLIEPRIJS (€/100L CBRB)",
      source: "interrijn-cbrb-kbn",
      retrievedAt: "2026-11-16T10:00:00.000Z",
      sourceLabel: "CBRB/KBN via Interrijn",
      vatStatus: "excl",
      sourceType: "automatic",
    });
    let currentCalls = 0;
    const payload = await getGasOilSurcharges({
      now: () => new Date("2026-11-10T12:00:00+01:00"),
      nlProvider: mockProvider("NL", "interrijn-cbrb-kbn", "CBRB/KBN via Interrijn", async () => {
        currentCalls += 1;
        return {
          ok: true,
          observation: {
            country: "NL",
            referenceDate: "2026-11-20",
            applicableMonth: "2026-11",
            priceExVatPer1000Liters: 1500,
            source: "interrijn-cbrb-kbn",
            sourceLabel: "CBRB/KBN via Interrijn",
            retrievedAt: "2026-11-20T12:00:00.000Z",
          },
        };
      }),
      beProvider: mockProvider("BE", "bestat-statbel", "be.STAT / FOD Economie", { ok: false, reason: "skip" }),
    });
    assert.equal(payload.nl.current.applicableMonth, "2026-11");
    assert.equal(payload.nl.next.applicableMonth, "2026-12");
    assert.equal(payload.nl.next.referenceDate, "2026-11-15");
    assert.equal(payload.nl.next.priceExVatPer1000Liters, 1700);
    assert.notEqual(payload.nl.next.priceExVatPer1000Liters, 1500);
    assert.ok(currentCalls >= 1);
  });
});
