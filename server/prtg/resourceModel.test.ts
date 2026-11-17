import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeServerResources,
  parseBytes,
  parsePercent,
  redactSecrets,
  responseHasSecrets,
  sensorCategory,
  type ProbeSensor,
} from "./resourceModel.js";

function sensor(partial: Partial<ProbeSensor> & Pick<ProbeSensor, "id" | "name" | "type">): ProbeSensor {
  return {
    device: "TEU-SRV-01",
    tags: "",
    statusCode: 3,
    message: "",
    lastvalue: "",
    group: "Servers",
    lastcheck: "17-11-2026 09:00:00",
    channels: [],
    ...partial,
  };
}

const retrievedAt = "2026-11-17T08:00:00.000Z";

test("SR13 CPU komt uit het PRTG-sensortype, niet uit een toevallige naam", () => {
  assert.equal(sensorCategory("SNMP CPU Load", "Load"), "cpu");
  assert.equal(sensorCategory("Factory Sensor", "CPU Load"), null);
  assert.equal(sensorCategory("", "CPU Load"), "cpu");
  const details = normalizeServerResources(
    "teu-srv-01",
    { name: "TEU-SRV-01", host: "10.1.2.3", group: "Gennep", statusCode: 3, message: "" },
    [sensor({ id: "1", name: "CPU", type: "SNMP CPU Load", lastvalue: "42 %" })],
    retrievedAt,
  );
  assert.equal(details?.cpu?.usedPercent, 42);
  assert.equal(details?.cpu?.status, "up");
  assert.ok(details?.cpu?.measuredAt);
});

test("SR14 WMI-geheugen rekent beschikbaar percentage om naar gebruik en bewaart bytes", () => {
  const details = normalizeServerResources(
    "teu-srv-01",
    null,
    [
      sensor({
        id: "2",
        name: "Memory",
        type: "WMI Memory",
        channels: [
          { name: "Available Memory %", lastvalue: "30 %" },
          { name: "Available Memory", lastvalue: "4096 MByte" },
        ],
      }),
    ],
    retrievedAt,
  );
  assert.equal(details?.memory?.usedPercent, 70);
  const primaryOnly = normalizeServerResources(
    "teu-srv-01",
    null,
    [sensor({ id: "2b", name: "Memory", type: "WMI Memory", lastvalue: "30 %" })],
    retrievedAt,
  );
  assert.equal(primaryOnly?.memory?.usedPercent, 70);
  assert.equal(details?.memory?.freeBytes, 4096 * 1000 ** 2);
  assert.equal(details?.memory?.totalBytes, null);
  assert.equal(details?.memory?.usedBytes, null);
});

test("SR15 SR16 schijven blijven aparte volumes met gebruikt percentage", () => {
  const details = normalizeServerResources(
    "teu-srv-01",
    null,
    [
      sensor({
        id: "c",
        name: "C:",
        type: "WMI Logical Disk",
        channels: [
          { name: "Free Space", lastvalue: "20 %" },
          { name: "Free Bytes", lastvalue: "40 GB" },
          { name: "Total", lastvalue: "200 GB" },
        ],
      }),
      sensor({
        id: "d",
        name: "D:",
        type: "SNMP Disk Free",
        channels: [{ name: "Percent Available", lastvalue: "50 %" }],
      }),
    ],
    retrievedAt,
  );
  assert.equal(details?.disks.length, 2);
  assert.equal(details?.disks[0]?.usedPercentage, 80);
  assert.equal(details?.disks[0]?.freeBytes, 40 * 1000 ** 3);
  assert.equal(details?.disks[0]?.totalBytes, 200 * 1000 ** 3);
  assert.equal(details?.disks[0]?.usedBytes, 160 * 1000 ** 3);
  assert.equal(details?.disks[1]?.name, "D:");
  assert.equal(details?.disks[1]?.usedPercentage, 50);
  const freePrimary = normalizeServerResources(
    "teu-srv-01",
    null,
    [sensor({ id: "e", name: "E:", type: "SNMP Disk Free", lastvalue: "20 %" })],
    retrievedAt,
  );
  assert.equal(freePrimary?.disks[0]?.usedPercentage, 80);
});

test("SR17 netwerk houdt in en uit in dezelfde snelheidseenheid", () => {
  const details = normalizeServerResources(
    "teu-srv-01",
    null,
    [
      sensor({
        id: "n",
        name: "NIC",
        type: "SNMP Traffic",
        channels: [
          { name: "Traffic In", lastvalue: "10 Mbit/s" },
          { name: "Traffic Out", lastvalue: "2 Mbit/s" },
          { name: "Discards In", lastvalue: "3 #" },
        ],
      }),
    ],
    retrievedAt,
  );
  assert.equal(details?.network.length, 1);
  assert.equal(details?.network[0]?.inbound, 10);
  assert.equal(details?.network[0]?.outbound, 2);
  assert.equal(details?.network[0]?.unit, "mbit/s");
  assert.equal(details?.network[0]?.errors, 3);
});

test("SR18 uptime en ping blijven tekst uit de sensor", () => {
  const details = normalizeServerResources(
    "teu-srv-01",
    null,
    [
      sensor({ id: "u", name: "Uptime", type: "SNMP Uptime", lastvalue: "42 d" }),
      sensor({ id: "p", name: "Ping", type: "Ping", lastvalue: "12 msec" }),
    ],
    retrievedAt,
  );
  assert.equal(details?.availability?.uptime, "42 d");
  assert.equal(details?.availability?.responseTime, "12 msec");
  assert.equal(details?.availability?.lastReboot, null);
});

test("SR19 SR20 waarschuwingen en storingen staan apart van overige sensoren", () => {
  const details = normalizeServerResources(
    "teu-srv-01",
    null,
    [
      sensor({ id: "w", name: "SSL", type: "SSL Certificate", statusCode: 4, message: "bijna verlopen", lastvalue: "10 d" }),
      sensor({ id: "down", name: "Dienst", type: "Windows Service", statusCode: 5, message: "gestopt", lastvalue: "Down" }),
      sensor({ id: "ok", name: "Klok", type: "SNMP Custom", statusCode: 3, lastvalue: "ok" }),
    ],
    retrievedAt,
  );
  assert.deepEqual(
    details?.alerts.map((item) => item.status),
    ["warning", "down"],
  );
  assert.equal(details?.otherSensors.length, 1);
  assert.equal(details?.otherSensors[0]?.name, "Klok");
});

test("SR21 SR23 SR24 ontbrekende, NaN en oneindige waarden worden leeg", () => {
  assert.equal(parsePercent("geen %"), null);
  assert.equal(parsePercent("NaN %"), null);
  assert.equal(parsePercent("Infinity %"), null);
  assert.equal(parseBytes("onbekend"), null);
  const details = normalizeServerResources(
    "teu-srv-01",
    { name: "TEU-SRV-01", host: "server.teunesen.local", group: "", statusCode: 3, message: "" },
    [sensor({ id: "m", name: "Memory", type: "WMI Memory", channels: [] })],
    retrievedAt,
  );
  assert.equal(details?.memory?.usedPercent, null);
  assert.equal(details?.ipAddress, null);
  assert.equal(details?.operatingSystem, null);
});

test("SR22 byte-eenheid blijft in bytes en snelheid blijft een rate", () => {
  assert.equal(parseBytes("1,5 GB"), 1.5 * 1000 ** 3);
  const details = normalizeServerResources(
    "teu-srv-01",
    null,
    [
      sensor({
        id: "n",
        name: "NIC",
        type: "SNMP Traffic",
        channels: [
          { name: "Traffic In", lastvalue: "800 kbit/s" },
          { name: "Traffic Out", lastvalue: "4 GB" },
        ],
      }),
    ],
    retrievedAt,
  );
  assert.equal(details?.network[0]?.unit, "kbit/s");
  assert.equal(details?.network[0]?.inbound, 800);
  assert.equal(details?.network[0]?.outbound, null);
});

test("SR25 antwoorden bevatten geen PRTG-geheim", () => {
  const clean = redactSecrets("passhash=abc password: geheim");
  assert.equal(clean.includes("abc"), false);
  assert.equal(clean.includes("geheim"), false);
  assert.equal(responseHasSecrets({ message: clean, source: "PRTG" }), false);
  assert.equal(responseHasSecrets({ leak: "password=zichtbaar" }), true);
});
