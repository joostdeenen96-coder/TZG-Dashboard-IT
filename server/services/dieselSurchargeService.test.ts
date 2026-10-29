import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { readFileSync } from "node:fs";
import type { DieselSurcharge, DieselWeek } from "../providers/dieselSurchargeProvider.js";
import {
  DIESEL_REFRESH_TTL_MS,
  getDieselSurcharge,
  resetDieselSurchargeForTests,
  setDieselCacheFileForTests,
  setDieselClockForTests,
  setDieselProviderForTests,
} from "./dieselSurchargeService.js";

function week(values: {
  itemId: string;
  peildatum: string;
  websiteWeek: number;
  dieselPrijs: number;
  raw: number;
  display: number;
}): DieselWeek {
  return {
    itemId: values.itemId,
    peildatum: values.peildatum,
    websiteWeek: values.websiteWeek,
    dieselPrijs: values.dieselPrijs,
    toeslagPercentage: values.display,
    toeslagPercentageRaw: values.raw,
    toeslagPercentageDisplay: values.display,
    actief: false,
  };
}

function payload(newest: DieselWeek, previous: DieselWeek): DieselSurcharge {
  return { ...newest, weken: [newest, previous] };
}

const newest = week({
  itemId: "new",
  peildatum: "2026-10-21",
  websiteWeek: 44,
  dieselPrijs: 2.2355,
  raw: 28.62,
  display: 28,
});
const previous = week({
  itemId: "prev",
  peildatum: "2026-10-14",
  websiteWeek: 43,
  dieselPrijs: 2.2438,
  raw: 28.9,
  display: 28,
});

function install(now: { value: number }) {
  const dir = mkdtempSync(path.join(tmpdir(), "diesel-cache-"));
  setDieselCacheFileForTests(path.join(dir, "diesel-week.json"));
  setDieselClockForTests(() => now.value);
  return dir;
}

test("DS1-DS9 cache van 300 seconden, één refresh en dezelfde records", async () => {
  const now = { value: 1_000_000 };
  install(now);
  let calls = 0;
  let current = payload(newest, previous);
  setDieselProviderForTests({
    async getCurrentData() {
      calls += 1;
      return current;
    },
  });
  try {
    assert.equal(DIESEL_REFRESH_TTL_MS, 300_000);
    const first = await getDieselSurcharge();
    assert.equal(calls, 1);
    assert.equal(first.peildatum, "2026-10-21");
    assert.equal(first.websiteWeek, 44);
    assert.equal(first.dieselPrijs, 2.2355);
    assert.equal(first.toeslagPercentageRaw, 28.62);
    assert.equal(first.toeslagPercentageDisplay, 28);
    assert.equal(first.weken[0]?.itemId, "new");
    assert.equal(first.weken[1]?.itemId, "prev");
    assert.equal(first.weken[0]?.websiteWeek, 44);
    assert.equal(first.weken[1]?.dieselPrijs, 2.2438);
    assert.equal(first.weken[1]?.toeslagPercentageRaw, 28.9);
    assert.equal(first.stale, undefined);

    now.value += DIESEL_REFRESH_TTL_MS - 1;
    const cached = await getDieselSurcharge();
    assert.equal(calls, 1);
    assert.equal(cached.peildatum, first.peildatum);

    now.value += 1;
    current = payload(
      week({
        itemId: "newer",
        peildatum: "2026-10-28",
        websiteWeek: 45,
        dieselPrijs: 2.11,
        raw: 30,
        display: 30,
      }),
      newest,
    );
    const refreshed = await getDieselSurcharge();
    assert.equal(calls, 2);
    assert.equal(refreshed.peildatum, "2026-10-28");
    assert.equal(refreshed.websiteWeek, 45);
    assert.equal(refreshed.weken[1]?.peildatum, "2026-10-21");
    assert.equal(refreshed.toeslagPercentageDisplay, 30);

    const selection = readFileSync(new URL("../diesel/selection.ts", import.meta.url), "utf8");
    const service = readFileSync(new URL("./dieselSurchargeService.ts", import.meta.url), "utf8");
    assert.equal(selection.includes("Math.floor"), true);
    assert.equal(service.includes("Math.floor"), false);
    assert.equal(service.includes("Math.round"), false);
  } finally {
    resetDieselSurchargeForTests();
  }
});

test("productie zonder cache gooit de fout door en gebruikt geen mock", async () => {
  const now = { value: 2_000 };
  install(now);
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  setDieselProviderForTests({
    async getCurrentData() {
      throw new Error("Graph weg");
    },
  });
  try {
    await assert.rejects(getDieselSurcharge(), /Graph weg/);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
    resetDieselSurchargeForTests();
  }
});

test("DS4 gelijktijdige requests delen één SharePoint-refresh", async () => {
  const now = { value: 5_000 };
  install(now);
  let calls = 0;
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  setDieselProviderForTests({
    async getCurrentData() {
      calls += 1;
      await gate;
      return payload(newest, previous);
    },
  });
  try {
    const first = getDieselSurcharge();
    const second = getDieselSurcharge();
    const third = getDieselSurcharge();
    assert.equal(calls, 1);
    release();
    const rows = await Promise.all([first, second, third]);
    assert.equal(calls, 1);
    assert.deepEqual(
      rows.map((row) => row.peildatum),
      ["2026-10-21", "2026-10-21", "2026-10-21"],
    );
  } finally {
    resetDieselSurchargeForTests();
  }
});

test("DS10-DS12 stale blijft staan, herstelt daarna, en logt geen geheimen", async () => {
  const now = { value: 10_000 };
  install(now);
  const logs: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...parts: unknown[]) => {
    logs.push(parts.map(String).join(" "));
  };
  console.error = (...parts: unknown[]) => {
    logs.push(parts.map(String).join(" "));
  };
  let mode: "ok" | "fail" = "ok";
  setDieselProviderForTests({
    async getCurrentData() {
      if (mode === "fail") {
        throw new Error("Authorization: Bearer SECRETTOKEN123 client_secret=supersecret");
      }
      return payload(newest, previous);
    },
  });
  try {
    const fresh = await getDieselSurcharge();
    assert.equal(fresh.dieselPrijs, 2.2355);
    mode = "fail";
    now.value += DIESEL_REFRESH_TTL_MS;
    const stale = await getDieselSurcharge();
    assert.equal(stale.stale, true);
    assert.equal(stale.peildatum, "2026-10-21");
    assert.equal(stale.websiteWeek, 44);
    assert.equal(stale.dieselPrijs, 2.2355);
    assert.equal(stale.toeslagPercentageDisplay, 28);
    assert.equal(stale.weken[1]?.dieselPrijs, 2.2438);
    assert.notEqual(stale.toeslagPercentageDisplay, 0);
    assert.notEqual(stale.dieselPrijs, 0);

    const duringOutage = await getDieselSurcharge();
    assert.equal(duringOutage.stale, true);
    assert.equal(duringOutage.peildatum, "2026-10-21");

    mode = "ok";
    now.value += DIESEL_REFRESH_TTL_MS;
    const recovered = await getDieselSurcharge();
    assert.equal(recovered.stale, undefined);
    assert.equal(recovered.peildatum, "2026-10-21");

    const text = logs.join("\n");
    assert.match(text, /diesel SharePoint refresh gestart/);
    assert.match(text, /diesel SharePoint refresh succesvol/);
    assert.match(text, /recordcount 2/);
    assert.match(text, /nieuwste Peildatum 2026-10-21/);
    assert.match(text, /WebsiteWeek 44/);
    assert.match(text, /diesel SharePoint refresh mislukt/);
    assert.match(text, /cache stale/);
    assert.equal(text.includes("SECRETTOKEN123"), false);
    assert.equal(text.includes("supersecret"), false);
    assert.equal(text.includes("Bearer SECRETTOKEN123"), false);
  } finally {
    console.log = originalLog;
    console.error = originalError;
    resetDieselSurchargeForTests();
  }
});
