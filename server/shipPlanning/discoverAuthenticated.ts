/**
 * Authenticated Schepenplanning discovery against planning.teunesen.nl.
 * Reads SHIP_PLANNING_* from the environment. Never logs secrets or tokens.
 *
 * Usage: npx tsx server/shipPlanning/discoverAuthenticated.ts
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = (process.env.SHIP_PLANNING_BASE_URL || "https://planning.teunesen.nl").replace(/\/$/, "");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const outPath = path.join(root, "docs/SCHEPENPLANNING-AUTH.md");

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

function redactDeep(value: unknown, depth = 0): Json {
  if (depth > 8) return "[depth]";
  if (value == null) return null;
  if (typeof value === "string") {
    if (value.length > 80 && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) return "[redacted-jwt]";
    if (/bearer\s+/i.test(value)) return "[redacted-bearer]";
    return value.length > 200 ? `${value.slice(0, 80)}…[truncated ${value.length}]` : value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 40).map((item) => redactDeep(item, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, Json> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      const low = key.toLowerCase();
      if (
        low.includes("password") ||
        low.includes("token") ||
        low.includes("secret") ||
        low.includes("authorization") ||
        low.includes("cookie") ||
        low === "totp"
      ) {
        out[key] = nested == null || nested === "" ? null : "[redacted]";
        continue;
      }
      out[key] = redactDeep(nested, depth + 1);
    }
    return out;
  }
  return String(value);
}

function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 12);
}

function amsterdamYmd(offsetDays: number) {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  // en-CA → YYYY-MM-DD
  const parts = fmt.formatToParts(now);
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const base = new Date(`${read("year")}-${read("month")}-${read("day")}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + offsetDays);
  const y = base.getUTCFullYear();
  const m = String(base.getUTCMonth() + 1).padStart(2, "0");
  const d = String(base.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function api(method: string, pathname: string, token: string | null, body?: unknown) {
  const headers: Record<string, string> = { accept: "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(`${BASE}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { _nonJson: true, _bytes: text.length, _preview: text.slice(0, 120) };
  }
  return { status: response.status, json, bytes: text.length };
}

function collectKeys(value: unknown, prefix = "", into = new Set<string>()) {
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 20)) collectKeys(item, prefix, into);
    return into;
  }
  if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      const pathKey = prefix ? `${prefix}.${key}` : key;
      into.add(pathKey);
      if (nested && typeof nested === "object") collectKeys(nested, pathKey, into);
    }
  }
  return into;
}

function scoreName(name: string) {
  const low = name.toLowerCase();
  let score = 0;
  for (const token of ["scheep", "schip", "ship", "vessel", "binnenvaart", "laad", "planning"]) {
    if (low.includes(token)) score += 10;
  }
  for (const token of ["hoofdstraat", "hoogveld", "venlo", "cuijk"]) {
    if (low.includes(token)) score += 5;
  }
  return score;
}

async function main() {
  const username = process.env.SHIP_PLANNING_USERNAME?.trim() || "";
  const password = process.env.SHIP_PLANNING_PASSWORD?.trim() || "";
  const totp = process.env.SHIP_PLANNING_TOTP_SECRET?.trim() || "";
  const apiKey = process.env.SHIP_PLANNING_API_KEY?.trim() || "";

  const report: string[] = [];
  const push = (line = "") => report.push(line);

  push("# Schepenplanning — authenticated discovery");
  push("");
  push(`Gegenereerd: ${new Date().toISOString()} (UTC)`);
  push(`Base URL: \`${BASE}\``);
  push("");

  if (!username || (!password && !apiKey)) {
    push("## Status: BLOKKADE");
    push("");
    push("Geen dedicated serviceaccount-secrets in de runtime.");
    push("");
    push("Vereist:");
    push("- `SHIP_PLANNING_USERNAME`");
    push("- `SHIP_PLANNING_PASSWORD` **of** `SHIP_PLANNING_API_KEY`");
    push("- optioneel `SHIP_PLANNING_TOTP_SECRET`");
    push("");
    push("Geen credentials gelogd. Geen UI gebouwd. STOP.");
    mkdirSync(path.dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${report.join("\n")}\n`, { mode: 0o600 });
    console.log(`Wrote ${outPath} (blocked: missing secrets)`);
    process.exitCode = 2;
    return;
  }

  push("## Authenticatie");
  push("");
  push(`Username aanwezig: ja (len=${username.length})`);
  push(`Password aanwezig: ${password ? "ja" : "nee"}`);
  push(`API-key aanwezig: ${apiKey ? "ja" : "nee"}`);
  push(`TOTP aanwezig: ${totp ? "ja" : "nee"}`);
  push("");

  let token: string | null = null;
  let authPayload: unknown = null;

  if (apiKey && !password) {
    push("API-key pad: nog niet vastgelegd in clientbundles als aparte login; probeert password-flow niet.");
    push("Status: BLOKKADE — API-key-only login vereist nader onderzoek na eerste password-login.");
    writeFileSync(outPath, `${report.join("\n")}\n`, { mode: 0o600 });
    process.exitCode = 2;
    return;
  }

  const loginBody: Record<string, string> = { username, password };
  if (totp) loginBody.totp = totp;

  const auth = await api("POST", "/api/user-access/authenticate", null, loginBody);
  push(`Login HTTP: ${auth.status}`);
  authPayload = auth.json;
  const redactedAuth = redactDeep(auth.json);
  push("Login response (redacted):");
  push("```json");
  push(JSON.stringify(redactedAuth, null, 2));
  push("```");
  push("");

  const authObj = auth.json && typeof auth.json === "object" ? (auth.json as Record<string, unknown>) : {};
  token =
    (typeof authObj.token === "string" && authObj.token) ||
    (typeof authObj.accessToken === "string" && authObj.accessToken) ||
    (authObj.authToken && typeof (authObj.authToken as { token?: string }).token === "string"
      ? (authObj.authToken as { token: string }).token
      : null);

  if (!token || auth.status >= 400) {
    push("## Status: AUTH MISLUKT");
    push("Geen Bearer-token ontvangen. STOP zonder verdere calls.");
    writeFileSync(outPath, `${report.join("\n")}\n`, { mode: 0o600 });
    process.exitCode = 1;
    return;
  }

  push(`Token ontvangen: ja (fingerprint=${fingerprint(token)}, len=${token.length})`);
  push("");

  const roleId =
    (authObj.applicationRoleId as string | number | undefined) ??
    ((authObj.currentUser as { applicationRoleId?: string | number } | undefined)?.applicationRoleId);

  if (roleId != null) {
    const refresh = await api("POST", "/api/user-access/refresh-token", token, { applicationRoleId: roleId });
    push(`Refresh HTTP: ${refresh.status}`);
    const refreshObj = refresh.json && typeof refresh.json === "object" ? (refresh.json as Record<string, unknown>) : {};
    if (typeof refreshObj.token === "string" && refreshObj.token) {
      token = refreshObj.token;
      push(`Refresh token ontvangen: ja (fingerprint=${fingerprint(token)})`);
    } else {
      push("Refresh: geen nieuw token in redacted response");
    }
    push("```json");
    push(JSON.stringify(redactDeep(refresh.json), null, 2));
    push("```");
    push("");
  }

  // Probe config/list endpoints
  const probes: Array<{ method: string; path: string; body?: unknown }> = [
    { method: "GET", path: "/api/user-access/account-settings" },
    { method: "GET", path: "/api/config/v2/data-types" },
    { method: "GET", path: "/api/config/data-types" },
    { method: "GET", path: "/api/feature-flags/all" },
    { method: "GET", path: "/api/ui-config/page-buttons/" },
  ];

  push("## Endpoint probes (na login)");
  push("");
  const typeCandidates: Array<{ id: string; name: string; score: number; raw: unknown }> = [];

  for (const probe of probes) {
    const result = await api(probe.method, probe.path, token, probe.body);
    push(`- \`${probe.method} ${probe.path}\` → ${result.status} (${result.bytes} bytes)`);
    const keys = [...collectKeys(result.json)].slice(0, 80);
    if (keys.length) push(`  keys: ${keys.join(", ")}`);

    const walk = (node: unknown) => {
      if (!node) return;
      if (Array.isArray(node)) {
        for (const item of node) walk(item);
        return;
      }
      if (typeof node !== "object") return;
      const row = node as Record<string, unknown>;
      const id = row.id ?? row.entityTypeId ?? row.dataTypeId ?? row.typeId;
      const name = String(row.name ?? row.displayName ?? row.dataTypeName ?? row.title ?? "");
      if (id != null && name) {
        const score = scoreName(name) + scoreName(String(id));
        if (score > 0 || /dataType|entityType/i.test(JSON.stringify(Object.keys(row)))) {
          typeCandidates.push({ id: String(id), name, score, raw: redactDeep(row) });
        }
      }
      for (const nested of Object.values(row)) {
        if (nested && typeof nested === "object") walk(nested);
      }
    };
    walk(result.json);
  }
  push("");

  typeCandidates.sort((a, b) => b.score - a.score);
  const unique = new Map<string, (typeof typeCandidates)[0]>();
  for (const candidate of typeCandidates) {
    if (!unique.has(candidate.id)) unique.set(candidate.id, candidate);
  }
  const ranked = [...unique.values()].slice(0, 40);
  push("## Candidate data types (heuristic)");
  push("");
  if (ranked.length === 0) {
    push("Geen dataType-lijst gevonden via standaard probes. Handmatige enumeratie nodig.");
  } else {
    for (const candidate of ranked) {
      push(`- id=\`${candidate.id}\` name=\`${candidate.name}\` score=${candidate.score}`);
    }
  }
  push("");

  const today = amsterdamYmd(0);
  const tomorrow = amsterdamYmd(1);
  push(`## Datum (Europe/Amsterdam)`);
  push(`- vandaag: \`${today}\``);
  push(`- morgen: \`${tomorrow}\``);
  push("");

  const targetIds = ranked.filter((row) => row.score >= 10).map((row) => row.id);
  if (targetIds.length === 0 && ranked[0]) targetIds.push(ranked[0].id);

  const requiredLabels = ["Tijd", "Klant", "Losplaats", "Conditie", "Product", "Hoeveelheid", "Schip"];
  const optionalLabels = ["Order", "Vervoerder", "Telnr", "Losdatum", "Opmerking planning"];
  const locationsWanted = ["Hoofdstraat", "Hoogveld", "Venlo", "Cuijk"];

  push("## Queries");
  push("");

  for (const typeId of targetIds.slice(0, 8)) {
    push(`### dataTypeId \`${typeId}\``);
    const schema = await api("GET", `/api/config/v2/data-types/${encodeURIComponent(typeId)}`, token);
    push(`Schema GET v2 → ${schema.status}`);
    if (schema.status >= 400) {
      const schemaV1 = await api("GET", `/api/config/data-types/${encodeURIComponent(typeId)}`, token);
      push(`Schema GET v1 → ${schemaV1.status}`);
      push("```json");
      push(JSON.stringify(redactDeep(schemaV1.json), null, 2));
      push("```");
    } else {
      push("```json");
      push(JSON.stringify(redactDeep(schema.json), null, 2));
      push("```");
    }

    const fieldKeys = [...collectKeys(schema.json)];
    push(`Schema keys sample: ${fieldKeys.slice(0, 60).join(", ")}`);

    for (const [label, day] of [
      ["morgen", tomorrow],
      ["vandaag", today],
    ] as const) {
      const filterAttempts = [
        `date EQ ${JSON.stringify(day)}`,
        `Datum EQ ${JSON.stringify(day)}`,
        `laaddatum EQ ${JSON.stringify(day)}`,
        `loadingDate EQ ${JSON.stringify(day)}`,
        `plannedDate EQ ${JSON.stringify(day)}`,
        `day EQ ${JSON.stringify(day)}`,
      ];
      for (const filter of filterAttempts) {
        const queryBody = { filter, pageSize: 100 };
        const queried = await api("POST", `/api/data/v2/${encodeURIComponent(typeId)}/query`, token, queryBody);
        if (queried.status >= 400) continue;
        const entities =
          (queried.json as { entities?: unknown[]; resources?: unknown[] } | null)?.entities ||
          (queried.json as { resources?: unknown[] } | null)?.resources ||
          [];
        push(`- ${label} filter=\`${filter}\` → ${queried.status}, n=${Array.isArray(entities) ? entities.length : "?"}`);
        if (Array.isArray(entities) && entities.length > 0) {
          push("  sample (redacted, max 2):");
          push("```json");
          push(JSON.stringify(redactDeep(entities.slice(0, 2)), null, 2));
          push("```");
          const entityKeys = [...collectKeys(entities)];
          push(`  entity fields: ${entityKeys.join(", ")}`);
          const blob = JSON.stringify(entities);
          for (const name of [...requiredLabels, ...optionalLabels, ...locationsWanted]) {
            if (blob.toLowerCase().includes(name.toLowerCase())) push(`  hit label/value: ${name}`);
          }
          break;
        }
      }

      // unfiltered small page to inspect shape
      const open = await api("POST", `/api/data/v2/${encodeURIComponent(typeId)}/query`, token, {
        pageSize: 5,
      });
      push(`- open query pageSize=5 → ${open.status}`);
      if (open.status < 400) {
        push("```json");
        push(JSON.stringify(redactDeep(open.json), null, 2));
        push("```");
      }
    }
    push("");
  }

  push("## Mapping checklist");
  push("");
  push("Vul pas in na echte veldnamen (geen verzinsels):");
  push("");
  push("| Target | Bronveld | Aanwezig |");
  push("| --- | --- | --- |");
  for (const target of [
    "time",
    "customer",
    "unloadingLocation",
    "condition",
    "product",
    "quantity",
    "quantityUnit",
    "vessel",
    "orderNumber",
    "carrier",
    "phoneNumber",
    "unloadingDate",
    "planningRemark",
    "loadingLocation",
  ]) {
    push(`| ${target} | _onbekend_ | nee |`);
  }
  push("");
  push("## STOP");
  push("");
  push("Geen UI gebouwd in deze fase. Tokens niet gelogd.");

  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${report.join("\n")}\n`, { mode: 0o600 });
  console.log(`Wrote ${outPath}`);
  // Ensure auth payload reference is not printed
  void authPayload;
}

main().catch((error) => {
  console.error("Discovery failed:", error instanceof Error ? error.message : "unknown");
  process.exitCode = 1;
});
