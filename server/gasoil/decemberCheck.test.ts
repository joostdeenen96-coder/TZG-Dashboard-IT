import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { runGasOilCheck } from "./check.js";
import { readGasOilMonthCache, writeGasOilMonthCache } from "./cache.js";
import { getGasOilSurcharges, isGasOilSourceOutage } from "./gasOilSurchargeService.js";
import {
  claimMorningRun,
  completeMorningRun,
  morningRunStatus,
  nextGasOilCheckDelay,
  nextMorningCheck,
  parseMorningClock,
  releaseMorningRun,
  shouldRunMorningCheckNow,
} from "./morningCheck.js";
import { isNextGasOilMonthOpen } from "./monthLogic.js";
import { BelgiumStatbelGasOilProvider, BELGIUM_PRODUCT } from "./providers/belgiumStatbelGasOilProvider.js";
import type { GasOilFetchOutcome, GasOilPriceProvider } from "./providers/gasOilPriceProvider.js";
import { NetherlandsInterrijnGasOilProvider } from "./providers/netherlandsInterrijnGasOilProvider.js";
import { calculateBelgiumSurcharge, calculateNetherlandsSurcharge } from "./staffelEngine.js";

const root = path.resolve(import.meta.dirname, "../..");
const homepage = readFileSync(
  path.join(root, "server/gasoil/fixtures/interrijn-homepage-peildatum-15okt.html"),
  "utf8",
);

function withTempDataDir(run: () => Promise<void>) {
  const dir = mkdtempSync(path.join(tmpdir(), "gasoil-dec-"));
  const previous = process.env.DATA_DIR;
  process.env.DATA_DIR = dir;
  return run().finally(() => {
    if (previous === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previous;
    rmSync(dir, { recursive: true, force: true });
  });
}

function provider(country: "NL" | "BE"): GasOilPriceProvider {
  return {
    country,
    sourceId: country === "NL" ? "interrijn-cbrb-kbn" : "bestat-statbel",
    sourceLabel: country === "NL" ? "CBRB/KBN via Interrijn" : "be.STAT / FOD Economie",
    async getCurrentObservation(): Promise<GasOilFetchOutcome> {
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
    productIdentifier: country === "NL" ? "GASOLIEPRIJS (€/100L CBRB)" : BELGIUM_PRODUCT,
    source: country === "NL" ? "interrijn-cbrb-kbn" : "bestat-statbel",
    retrievedAt: "2026-11-15T08:00:00.000Z",
    sourceLabel: country === "NL" ? "CBRB/KBN via Interrijn" : "be.STAT / FOD Economie",
    vatStatus: "excl",
    sourceType: "automatic",
  });
}

function nlHtml(published: string, price: string) {
  return homepage
    .replaceAll("15-10-26", published)
    .replaceAll("164.26", price);
}

function nlProvider(published: string, price: string) {
  const html = nlHtml(published, price);
  return new NetherlandsInterrijnGasOilProvider({
    fetchText: async (url) => (url.includes("archief") ? "uitsluitend toegankelijk na registratie" : html),
  });
}

function bePayload() {
  return JSON.stringify({
    facts: [
      {
        Dag: "15okt26",
        Product: BELGIUM_PRODUCT,
        "Prijs excl. BTW": "1,2947",
        "Prijs incl. BTW": "1,5666",
      },
      {
        Dag: "15nov26",
        Product: BELGIUM_PRODUCT,
        "Prijs excl. BTW": "1,1408",
        "Prijs incl. BTW": "1,3804",
      },
    ],
  });
}

function beProvider(text = bePayload()) {
  return new BelgiumStatbelGasOilProvider({
    fetchText: async () => text,
  });
}

test("DEC1 14 november 23:59 vraagt december niet op", async () => {
  await withTempDataDir(async () => {
    month("NL", "2026-11", "2026-10-15", 1642.6);
    month("BE", "2026-11", "2026-10-15", 1294.7);
    const now = new Date("2026-11-14T22:59:00Z");
    assert.equal(isNextGasOilMonthOpen(now), false);
    const payload = await getGasOilSurcharges({
      now: () => now,
      nlProvider: provider("NL"),
      beProvider: provider("BE"),
    });
    assert.equal(payload.nextInquiry, "closed");
    assert.equal(payload.nl.current.applicableMonth, "2026-11");
    assert.equal(payload.nl.next.applicableMonth, "2026-12");
    assert.equal(payload.nl.next.surchargePerTon, null);
    assert.equal(payload.be.next.surchargePerTon, null);
  });
});

test("DEC2 DEC3 15 en 26 november tonen november en december", async () => {
  await withTempDataDir(async () => {
    month("NL", "2026-11", "2026-10-15", 1642.6);
    month("BE", "2026-11", "2026-10-15", 1294.7);
    for (const iso of ["2026-11-14T23:00:00Z", "2026-11-26T09:00:00Z"]) {
      const payload = await getGasOilSurcharges({
        now: () => new Date(iso),
        nlProvider: provider("NL"),
        beProvider: provider("BE"),
      });
      assert.equal(payload.nextInquiry, "open", iso);
      assert.equal(payload.nl.current.applicableMonth, "2026-11", iso);
      assert.equal(payload.nl.next.applicableMonth, "2026-12", iso);
      assert.equal(payload.be.current.applicableMonth, "2026-11", iso);
      assert.equal(payload.be.next.applicableMonth, "2026-12", iso);
    }
  });
});

test("DEC4 DEC5 1 december en de jaarwisseling schuiven de maanden door", async () => {
  await withTempDataDir(async () => {
    month("NL", "2026-12", "2026-11-15", 1700);
    month("NL", "2027-01", "2026-12-15", 1800);
    const december = await getGasOilSurcharges({
      now: () => new Date("2026-12-01T00:30:00+01:00"),
      nlProvider: provider("NL"),
      beProvider: provider("BE"),
    });
    assert.equal(december.nextInquiry, "closed");
    assert.equal(december.nl.current.applicableMonth, "2026-12");
    assert.equal(december.nl.next.applicableMonth, "2027-01");
    assert.equal(december.nl.next.surchargePerTon, null);

    const newYear = await getGasOilSurcharges({
      now: () => new Date("2026-12-31T23:00:00Z"),
      nlProvider: provider("NL"),
      beProvider: provider("BE"),
    });
    assert.equal(newYear.nl.current.applicableMonth, "2027-01");
    assert.equal(newYear.nl.next.applicableMonth, "2027-02");
    assert.equal(newYear.nextInquiry, "closed");

    const midJanuary = await getGasOilSurcharges({
      now: () => new Date("2027-01-15T08:00:00+01:00"),
      nlProvider: provider("NL"),
      beProvider: provider("BE"),
    });
    assert.equal(midJanuary.nextInquiry, "open");
    assert.equal(midJanuary.nl.current.applicableMonth, "2027-01");
    assert.equal(midJanuary.nl.next.applicableMonth, "2027-02");
  });
});

test("DEC6 een gepubliceerde Belgische peildatum wordt december", async () => {
  await withTempDataDir(async () => {
    const payload = await getGasOilSurcharges({
      now: () => new Date("2026-11-26T09:00:00Z"),
      nlProvider: provider("NL"),
      beProvider: beProvider(),
    });
    assert.equal(payload.be.current.applicableMonth, "2026-11");
    assert.equal(payload.be.current.referenceDate, "2026-10-15");
    assert.equal(payload.be.current.surchargePerTon, 0.96);
    assert.equal(payload.be.next.applicableMonth, "2026-12");
    assert.equal(payload.be.next.referenceDate, "2026-11-15");
    assert.equal(payload.be.next.priceExVatPer1000Liters, 1140.8);
    assert.equal(payload.be.next.surchargePerTon, calculateBelgiumSurcharge(1140.8));
    assert.equal(payload.be.next.status, "ok");
  });
});

test("DEC7 een homepage op exact 15 november legt december vast", async () => {
  await withTempDataDir(async () => {
    const payload = await getGasOilSurcharges({
      now: () => new Date("2026-11-26T09:00:00Z"),
      nlProvider: nlProvider("15-11-26", "170.00"),
      beProvider: provider("BE"),
    });
    assert.equal(payload.nl.next.applicableMonth, "2026-12");
    assert.equal(payload.nl.next.referenceDate, "2026-11-15");
    assert.equal(payload.nl.next.priceExVatPer1000Liters, 1700);
    assert.equal(payload.nl.next.surchargePerTon, calculateNetherlandsSurcharge(1700));
    assert.notEqual(payload.nl.next.surchargePerTon, 1.9);
    assert.equal(readGasOilMonthCache("NL", "2026-12")?.referenceDate, "2026-11-15");
  });
});

test("DEC8 de dagprijs van 25 november is geen decemberpublicatie", async () => {
  await withTempDataDir(async () => {
    const payload = await getGasOilSurcharges({
      now: () => new Date("2026-11-26T09:00:00Z"),
      nlProvider: nlProvider("25-11-26", "140.41"),
      beProvider: provider("BE"),
    });
    assert.equal(payload.nextInquiry, "open");
    assert.equal(payload.nl.next.applicableMonth, "2026-12");
    assert.equal(payload.nl.next.status, "unavailable");
    assert.equal(payload.nl.next.surchargePerTon, null);
    assert.equal(payload.nl.next.referenceDate, null);
    assert.equal(readGasOilMonthCache("NL", "2026-12"), null);
  });
});

test("DEC9 DEC16 DEC17 de API en de kaart laten december staan, ook zonder bedrag", () => {
  const card = readFileSync(path.join(root, "src/components/DieselCard.tsx"), "utf8");
  const client = readFileSync(path.join(root, "src/services/gasOilService.ts"), "utf8");
  const route = readFileSync(path.join(root, "server/routes/gasOilSurcharges.ts"), "utf8");
  assert.match(card, /nextOpen \? \(result\?\.next \?\? null\) : null/);
  assert.match(card, /\{nextOpen \? <GasOilMonthPane kind="next"/);
  assert.match(card, /data-gas-unknown/);
  assert.equal(card.includes("Volgende maand nog niet gepubliceerd"), false);
  assert.match(client, /nextInquiry/);
  assert.match(client, /unknownMonth\(country, shiftMonth\(current\.applicableMonth\)/);
  assert.match(route, /Cache-Control", "no-store"/);
});

test("DEC10 DEC11 de ochtendcontrole staat op 06:00 Europe/Amsterdam", () => {
  const source = readFileSync(path.join(root, "server/gasoil/morningCheck.ts"), "utf8");
  assert.equal(parseMorningClock(undefined)?.hour, 6);
  assert.equal(parseMorningClock(undefined)?.minute, 0);
  assert.match(source, /Europe\/Amsterdam/);
  assert.match(source, /runGasOilCheck/);
  assert.equal(
    nextMorningCheck(new Date("2026-11-26T04:30:00Z"), { hour: 6, minute: 0 }).toISOString(),
    "2026-11-26T05:00:00.000Z",
  );
});

test("DEC12 DEC13 DEC14 een geslaagde run blijft staan en een mislukte of ontbrekende run niet", async () => {
  await withTempDataDir(async () => {
    assert.equal(claimMorningRun("2026-11-26", new Date("2026-11-26T05:00:00Z")), true);
    completeMorningRun("2026-11-26", new Date("2026-11-26T05:01:00Z"));
    assert.equal(morningRunStatus("2026-11-26"), "success");
    assert.equal(claimMorningRun("2026-11-26", new Date("2026-11-26T10:00:00Z")), false);
    assert.equal(shouldRunMorningCheckNow(new Date("2026-11-26T10:00:00Z"), { hour: 6, minute: 0 }, "success"), false);

    releaseMorningRun("2026-11-26");
    assert.equal(morningRunStatus("2026-11-26"), "none");
    assert.equal(shouldRunMorningCheckNow(new Date("2026-11-26T04:30:00Z"), { hour: 6, minute: 0 }, "none"), false);
    assert.equal(shouldRunMorningCheckNow(new Date("2026-11-26T05:30:00Z"), { hour: 6, minute: 0 }, "none"), true);
    writeFileSync(path.join(process.env.DATA_DIR!, "gasoil-morning-2026-11-26.lock"), "started 2026-11-26T07:59:00.000Z");
    assert.equal(claimMorningRun("2026-11-26", new Date("2026-11-26T08:00:00.000Z")), false);
    assert.equal(claimMorningRun("2026-11-26", new Date("2026-11-26T08:00:00.000Z"), { reclaimStarted: true }), true);
    releaseMorningRun("2026-11-26");
    writeFileSync(path.join(process.env.DATA_DIR!, "gasoil-morning-2026-11-26.lock"), "started 2026-11-26T05:00:00.000Z");
    assert.equal(morningRunStatus("2026-11-26"), "started");
    assert.equal(shouldRunMorningCheckNow(new Date("2026-11-26T08:00:00Z"), { hour: 6, minute: 0 }, "started"), true);
    assert.equal(claimMorningRun("2026-11-26", new Date("2026-11-26T08:00:00Z")), true);

    const failed = await runGasOilCheck({
      now: () => new Date("2026-11-26T09:00:00Z"),
      nlProvider: new NetherlandsInterrijnGasOilProvider({
        fetchText: async () => {
          throw new Error("Interrijn niet bereikbaar.");
        },
      }),
      beProvider: new BelgiumStatbelGasOilProvider({
        fetchText: async () => {
          throw new Error("be.STAT niet bereikbaar.");
        },
      }),
    });
    assert.equal(failed.status, "failed");
    assert.equal(isGasOilSourceOutage("Interrijn niet bereikbaar."), true);
    assert.equal(isGasOilSourceOutage("Homepage-publicatie 2026-11-25 is niet peildatum 2026-11-15; dagprijs wordt niet gebruikt."), false);
    if (failed.status === "failed") releaseMorningRun("2026-11-26");
    assert.notEqual(morningRunStatus("2026-11-26"), "success");
    const retry = nextGasOilCheckDelay(new Date("2026-11-26T05:10:00Z"), { hour: 6, minute: 0 }, true, 6 * 60 * 60 * 1000);
    const tomorrow = nextGasOilCheckDelay(new Date("2026-11-26T05:10:00Z"), { hour: 6, minute: 0 }, false);
    assert.ok(retry < tomorrow);
  });
});

test("DEC15 een nieuwe decemberobservatie is bij de volgende aanvraag zichtbaar", async () => {
  await withTempDataDir(async () => {
    const now = () => new Date("2026-11-26T09:00:00Z");
    const first = await getGasOilSurcharges({
      now,
      nlProvider: nlProvider("25-11-26", "140.41"),
      beProvider: provider("BE"),
    });
    assert.equal(first.nl.next.surchargePerTon, null);
    const second = await getGasOilSurcharges({
      now,
      nlProvider: nlProvider("15-11-26", "170.00"),
      beProvider: provider("BE"),
    });
    assert.equal(second.nl.next.surchargePerTon, calculateNetherlandsSurcharge(1700));
    const third = await getGasOilSurcharges({
      now,
      nlProvider: new NetherlandsInterrijnGasOilProvider({
        fetchText: async () => {
          throw new Error("Interrijn niet bereikbaar.");
        },
      }),
      beProvider: provider("BE"),
    });
    assert.equal(third.nl.next.applicableMonth, "2026-12");
    assert.equal(third.nl.next.surchargePerTon, calculateNetherlandsSurcharge(1700));
    assert.equal(third.nl.next.status, "ok");
  });
});

test("DEC18 DEC19 maandobservaties blijven in de data-map en de database wist ze niet", async () => {
  await withTempDataDir(async () => {
    month("NL", "2026-11", "2026-10-15", 1642.6);
    month("BE", "2026-12", "2026-11-15", 1140.8);
    assert.equal(readGasOilMonthCache("NL", "2026-11")?.priceExVatPer1000Liters, 1642.6);
    assert.equal(readGasOilMonthCache("BE", "2026-12")?.referenceDate, "2026-11-15");
  });
  const store = readFileSync(path.join(root, "server/gasoil/pgStore.ts"), "utf8");
  const migration = readFileSync(path.join(root, "server/db/migrations/002_gasoil_months.sql"), "utf8");
  assert.match(store, /ON CONFLICT \(country, applicable_month\) DO NOTHING/);
  assert.equal(store.toLowerCase().includes("delete from gasoil_month"), false);
  assert.match(migration, /gasoil_month_observations/);
});

test("DEC20 de diagnose gebruikt dezelfde controle en print geen secrets", () => {
  const script = readFileSync(path.join(root, "server/scripts/gasoil-check.ts"), "utf8");
  const pkg = readFileSync(path.join(root, "package.json"), "utf8");
  const check = readFileSync(path.join(root, "server/gasoil/check.ts"), "utf8");
  assert.match(script, /runGasOilCheck/);
  assert.match(pkg, /"gasoil:check": "tsx server\/scripts\/gasoil-check.ts"/);
  assert.match(pkg, /"gasoil:check:prod": "node dist\/server\/scripts\/gasoil-check.js"/);
  assert.equal(script.includes("DATABASE_URL"), false);
  assert.equal(script.includes("PASSWORD"), false);
  assert.match(check, /getGasOilSurcharges/);
  assert.equal(check.includes("html"), false);
});
