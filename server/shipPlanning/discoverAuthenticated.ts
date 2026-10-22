/**
 * Authenticated Schepenplanning discovery against planning.teunesen.nl.
 *
 * Production (TEU-NC-01, geen tsx):
 *   node dist/server/shipPlanning/discoverAuthenticated.js
 *   ./scripts/ship-planning-discover.sh
 *
 * Development:
 *   npx tsx server/shipPlanning/discoverAuthenticated.ts
 *
 * Secrets: SHIP_PLANNING_USERNAME / PASSWORD (optioneel TOTP / API_KEY / BASE_URL)
 * uit process.env of lokale `.env` — nooit loggen, committen of naar de frontend.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { appRoot, dataDir } from "../appPaths.js";

const SECRET_ENV_KEYS = [
  "SHIP_PLANNING_USERNAME",
  "SHIP_PLANNING_PASSWORD",
  "SHIP_PLANNING_TOTP_SECRET",
  "SHIP_PLANNING_API_KEY",
  "SHIP_PLANNING_BASE_URL",
] as const;

/** Laad alleen SHIP_PLANNING_* uit .env wanneer nog niet in process.env. Geen logging van waarden. */
function loadShipPlanningEnvFile() {
  const candidates = [
    process.env.SHIP_PLANNING_ENV_FILE?.trim(),
    path.join(appRoot(), ".env"),
    path.join(process.cwd(), ".env"),
  ].filter((value): value is string => Boolean(value));

  for (const file of candidates) {
    if (!existsSync(file)) continue;
    let text = "";
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      if (!SECRET_ENV_KEYS.includes(key as (typeof SECRET_ENV_KEYS)[number])) continue;
      if (process.env[key]?.trim()) continue;
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
    break;
  }
}

loadShipPlanningEnvFile();

const BASE = (process.env.SHIP_PLANNING_BASE_URL || "https://planning.teunesen.nl").replace(/\/$/, "");

function resolveOutPath() {
  const fromEnv = process.env.SHIP_PLANNING_DISCOVERY_OUT?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  const docsPath = path.join(appRoot(), "docs", "SCHEPENPLANNING-AUTH.md");
  // In Docker is docs/ niet gemount; schrijf dan naar data-volume.
  if (existsSync(path.dirname(docsPath)) && !process.env.SHIP_PLANNING_FORCE_DATA_OUT) {
    return docsPath;
  }
  return path.join(dataDir(), "ship-planning-discovery.md");
}

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

const REDACT_KEY =
  /(password|passwd|token|secret|authorization|cookie|set-cookie|totp|api[_-]?key|username|userName|email|refresh)/i;

function redactDeep(value: unknown, depth = 0): Json {
  if (depth > 8) return "[depth]";
  if (value == null) return null;
  if (typeof value === "string") {
    if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value) && value.length > 40) {
      return "[redacted-jwt]";
    }
    if (/bearer\s+/i.test(value)) return "[redacted-bearer]";
    return value.length > 200 ? `${value.slice(0, 60)}…[truncated ${value.length}]` : value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 30).map((item) => redactDeep(item, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, Json> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (REDACT_KEY.test(key)) {
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
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(new Date());
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const base = new Date(`${read("year")}-${read("month")}-${read("day")}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + offsetDays);
  return `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, "0")}-${String(base.getUTCDate()).padStart(2, "0")}`;
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
    json = { _nonJson: true, _bytes: text.length };
  }
  return { status: response.status, json, bytes: text.length };
}

function collectKeys(value: unknown, prefix = "", into = new Set<string>()) {
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 25)) collectKeys(item, prefix, into);
    return into;
  }
  if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (REDACT_KEY.test(key)) continue;
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
  for (const token of ["scheep", "schip", "ship", "vessel", "binnenvaart", "laadplaats", "schepenplanning"]) {
    if (low.includes(token)) score += 12;
  }
  for (const token of ["planning", "laad", "lossing", "order"]) {
    if (low.includes(token)) score += 4;
  }
  for (const token of ["hoofdstraat", "hoogveld", "venlo", "cuijk"]) {
    if (low.includes(token)) score += 6;
  }
  return score;
}

function extractToken(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const row = payload as Record<string, unknown>;
  if (typeof row.token === "string" && row.token) return row.token;
  if (typeof row.accessToken === "string" && row.accessToken) return row.accessToken;
  if (row.authToken && typeof row.authToken === "object") {
    const nested = row.authToken as Record<string, unknown>;
    if (typeof nested.token === "string") return nested.token;
  }
  return null;
}

function extractEntities(payload: unknown): unknown[] {
  if (!payload || typeof payload !== "object") return [];
  const row = payload as Record<string, unknown>;
  if (Array.isArray(row.entities)) return row.entities;
  if (Array.isArray(row.resources)) return row.resources;
  if (Array.isArray(row.items)) return row.items;
  if (Array.isArray(row.data)) return row.data;
  return [];
}

function flattenAttributes(entity: unknown): Record<string, unknown> {
  if (!entity || typeof entity !== "object") return {};
  const row = entity as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (REDACT_KEY.test(key)) continue;
    if (key === "attributes" && value && typeof value === "object" && !Array.isArray(value)) {
      for (const [attrKey, attrValue] of Object.entries(value as Record<string, unknown>)) {
        if (!REDACT_KEY.test(attrKey)) out[attrKey] = attrValue;
      }
      continue;
    }
    out[key] = value;
  }
  return out;
}

type TargetField =
  | "loadingLocation"
  | "time"
  | "customer"
  | "unloadingLocation"
  | "condition"
  | "product"
  | "quantity"
  | "quantityUnit"
  | "vessel"
  | "orderNumber"
  | "carrier"
  | "phoneNumber"
  | "unloadingDate"
  | "planningRemark";

const FIELD_SYNONYMS: Record<TargetField, string[]> = {
  loadingLocation: ["laadplaats", "loadinglocation", "loading_location", "laadlocatie", "groeve", "location"],
  time: ["tijd", "time", "laadtijd", "starttijd", "uur", "plannedtime"],
  customer: ["klant", "customer", "client", "opdrachtgever"],
  unloadingLocation: ["losplaats", "unloadinglocation", "loslocatie", "bestemming", "destination"],
  condition: ["conditie", "condition", "staat"],
  product: ["product", "materiaal", "artikel", "goed"],
  quantity: ["hoeveelheid", "quantity", "qty", "tonnage", "amount", "volume"],
  quantityUnit: ["eenheid", "unit", "quantityunit", "hoeveelheideenheid"],
  vessel: ["schip", "vessel", "ship", "boot", "binnenschip"],
  orderNumber: ["order", "ordernummer", "ordernumber", "orderid", "ordernr"],
  carrier: ["vervoerder", "carrier", "rederij", "transporteur"],
  phoneNumber: ["telnr", "telefoon", "phone", "phonenumber", "tel"],
  unloadingDate: ["losdatum", "unloadingdate", "lossingsdatum"],
  planningRemark: ["opmerking", "remark", "opmerkingplanning", "planningremark", "note", "notitie"],
};

function matchField(keys: string[], target: TargetField): string | null {
  const synonyms = FIELD_SYNONYMS[target];
  const normalized = keys.map((key) => ({
    key,
    leaf: key.split(".").pop() || key,
    low: (key.split(".").pop() || key).toLowerCase().replace(/[^a-z0-9]/g, ""),
  }));
  for (const synonym of synonyms) {
    const hit = normalized.find((row) => row.low === synonym || row.low.includes(synonym));
    if (hit) return hit.leaf;
  }
  return null;
}

function operationalSample(entity: unknown, mapping: Partial<Record<TargetField, string>>) {
  const flat = flattenAttributes(entity);
  const sample: Record<string, unknown> = {};
  for (const [target, source] of Object.entries(mapping) as Array<[TargetField, string]>) {
    if (!source) continue;
    if (source in flat) sample[target] = flat[source];
  }
  return sample;
}

function looksLikeTotpRequired(payload: unknown, status: number) {
  const text = JSON.stringify(payload ?? {}).toLowerCase();
  return (
    status === 401 ||
    status === 403 ||
    text.includes("totp") ||
    text.includes("twofactor") ||
    text.includes("two-factor") ||
    text.includes("mfa")
  );
}

async function main() {
  const outPath = resolveOutPath();
  const username = process.env.SHIP_PLANNING_USERNAME?.trim() || "";
  const password = process.env.SHIP_PLANNING_PASSWORD?.trim() || "";
  const totp = process.env.SHIP_PLANNING_TOTP_SECRET?.trim() || "";
  const apiKey = process.env.SHIP_PLANNING_API_KEY?.trim() || "";

  const report: string[] = [];
  const push = (line = "") => report.push(line);
  const summary = {
    auth: "FAIL" as "PASS" | "FAIL",
    dataset: "FAIL" as "PASS" | "FAIL",
    dataTypeId: "",
    tomorrowQuery: false,
    todayQuery: false,
    totpRequired: "unknown" as "yes" | "no" | "unknown",
  };

  push("# Schepenplanning — authenticated discovery");
  push("");
  push(`Gegenereerd: ${new Date().toISOString()} (UTC)`);
  push(`Base URL: \`${BASE}\``);
  push(`Output: \`${outPath}\``);
  push("");

  const writeReport = () => {
    mkdirSync(path.dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${report.join("\n")}\n`, { mode: 0o600 });
  };

  if (!username || (!password && !apiKey)) {
    push("## Status: BLOKKADE");
    push("");
    push("Geen dedicated serviceaccount-secrets in de runtime / `.env`.");
    push("");
    push("Vereist op TEU-NC-01 in `.env` (niet committen):");
    push("- `SHIP_PLANNING_USERNAME`");
    push("- `SHIP_PLANNING_PASSWORD`");
    push("- optioneel `SHIP_PLANNING_TOTP_SECRET` / `SHIP_PLANNING_API_KEY`");
    push("");
    push("## Summary");
    push("");
    push("AUTH: FAIL");
    push("DATASET: FAIL");
    push("dataTypeId: ");
    push("tomorrow query: vastgesteld nee");
    push("today query: vastgesteld nee");
    push("");
    push("STOP — geen UI.");
    writeReport();
    console.log(`Wrote ${outPath} (blocked: missing secrets)`);
    console.log("AUTH: FAIL");
    console.log("DATASET: FAIL");
    process.exitCode = 2;
    return;
  }

  push("## Authenticatie");
  push("");
  push("Username: [redacted] (aanwezig)");
  push(`Password: ${password ? "[redacted] (aanwezig)" : "ontbreekt"}`);
  push(`API-key: ${apiKey ? "[redacted] (aanwezig)" : "ontbreekt"}`);
  push(`TOTP-secret: ${totp ? "[redacted] (aanwezig)" : "ontbreekt"}`);
  push("");

  if (apiKey && !password) {
    push("API-key-only login is in deze client niet als apart auth-endpoint vastgelegd.");
    push("AUTH: FAIL — gebruik password(+optioneel TOTP) voor discovery.");
    summary.auth = "FAIL";
    writeReport();
    console.log("AUTH: FAIL");
    process.exitCode = 1;
    return;
  }

  const loginBody: Record<string, string> = { username, password };
  if (totp) loginBody.totp = totp;

  const auth = await api("POST", "/api/user-access/authenticate", null, loginBody);
  push(`Login HTTP: ${auth.status}`);
  push("Login response (volledig geredigeerd):");
  push("```json");
  push(JSON.stringify(redactDeep(auth.json), null, 2));
  push("```");
  push("");

  let token = extractToken(auth.json);
  if ((!token || auth.status >= 400) && !totp && looksLikeTotpRequired(auth.json, auth.status)) {
    summary.totpRequired = "yes";
    push("TOTP lijkt verplicht (response/status wijst op MFA). Zet `SHIP_PLANNING_TOTP_SECRET`.");
  }

  if (!token || auth.status >= 400) {
    push("## Status: AUTH MISLUKT");
    push(`TOTP required: ${summary.totpRequired}`);
    push("");
    push("## Summary");
    push("AUTH: FAIL");
    push("DATASET: FAIL");
    push("dataTypeId: ");
    push("tomorrow query: vastgesteld nee");
    push("today query: vastgesteld nee");
    writeReport();
    console.log("AUTH: FAIL");
    process.exitCode = 1;
    return;
  }

  summary.auth = "PASS";
  if (!totp) summary.totpRequired = summary.totpRequired === "yes" ? "yes" : "no";
  push(`Bearer ontvangen: ja (fingerprint=${fingerprint(token)}, len=${token.length}) — waarde niet gelogd`);
  push(`TOTP nodig voor deze login: ${summary.totpRequired}`);
  push("");

  const authObj = auth.json && typeof auth.json === "object" ? (auth.json as Record<string, unknown>) : {};
  const roleId =
    (authObj.applicationRoleId as string | number | undefined) ??
    ((authObj.currentUser as { applicationRoleId?: string | number } | undefined)?.applicationRoleId);

  if (roleId != null) {
    const refresh = await api("POST", "/api/user-access/refresh-token", token, { applicationRoleId: roleId });
    push(`Refresh HTTP: ${refresh.status}`);
    const refreshed = extractToken(refresh.json);
    if (refreshed) {
      token = refreshed;
      push(`Refresh OK (fingerprint=${fingerprint(token)})`);
    }
    push("```json");
    push(JSON.stringify(redactDeep(refresh.json), null, 2));
    push("```");
    push("");
  }

  const tenant = await api("GET", "/api/user-access/application/fromDomain", token);
  push("## Tenant");
  push(`fromDomain HTTP: ${tenant.status}`);
  push("```json");
  push(JSON.stringify(redactDeep(tenant.json), null, 2));
  push("```");
  push("");

  const probes: Array<{ method: string; path: string; body?: unknown }> = [
    { method: "GET", path: "/api/user-access/account-settings" },
    { method: "GET", path: "/api/config/v2/data-types" },
    { method: "GET", path: "/api/config/data-types" },
    { method: "GET", path: "/api/feature-flags/all" },
    { method: "GET", path: "/api/user-access/applications" },
  ];

  push("## Endpoint probes");
  push("");
  const typeCandidates: Array<{ id: string; name: string; score: number }> = [];

  const walkTypes = (node: unknown) => {
    if (!node) return;
    if (Array.isArray(node)) {
      for (const item of node) walkTypes(item);
      return;
    }
    if (typeof node !== "object") return;
    const row = node as Record<string, unknown>;
    const id = row.id ?? row.entityTypeId ?? row.dataTypeId ?? row.typeId ?? row.name;
    const name = String(row.displayName ?? row.dataTypeName ?? row.name ?? row.title ?? "");
    if (id != null && name) {
      const score = scoreName(name) + scoreName(String(id));
      if (score > 0) typeCandidates.push({ id: String(id), name, score });
    }
    for (const nested of Object.values(row)) {
      if (nested && typeof nested === "object") walkTypes(nested);
    }
  };

  for (const probe of probes) {
    const result = await api(probe.method, probe.path, token, probe.body);
    push(`- \`${probe.method} ${probe.path}\` → ${result.status} (${result.bytes} B)`);
    walkTypes(result.json);
  }
  push("");

  typeCandidates.sort((a, b) => b.score - a.score);
  const unique = new Map<string, (typeof typeCandidates)[0]>();
  for (const candidate of typeCandidates) {
    if (!unique.has(candidate.id)) unique.set(candidate.id, candidate);
  }
  const ranked = [...unique.values()];
  push("## Candidate data types");
  push("");
  if (ranked.length === 0) push("Geen dataType-kandidaten uit probes.");
  for (const candidate of ranked.slice(0, 50)) {
    push(`- id=\`${candidate.id}\` name=\`${candidate.name}\` score=${candidate.score}`);
  }
  push("");

  const today = amsterdamYmd(0);
  const tomorrow = amsterdamYmd(1);
  push("## Datum (Europe/Amsterdam)");
  push(`- vandaag: \`${today}\``);
  push(`- morgen: \`${tomorrow}\``);
  push("");

  let targetIds = ranked.filter((row) => row.score >= 10).map((row) => row.id);
  if (targetIds.length === 0) targetIds = ranked.slice(0, 5).map((row) => row.id);

  // Als er geen lijst is: probeer open query niet blind op willekeurige IDs.
  const locationsWanted = ["Hoofdstraat", "Hoogveld", "Venlo", "Cuijk"];
  const mapping: Partial<Record<TargetField, string>> = {};
  const allColumns = new Set<string>();
  const foundLocations = new Set<string>();
  let bestTypeId = "";
  let tomorrowFilter = "";
  let todayFilter = "";
  let continuationSeen = false;
  let pageSizeDefault: number | null = null;

  push("## Queries");
  push("");

  for (const typeId of targetIds.slice(0, 12)) {
    push(`### dataTypeId \`${typeId}\``);
    const schema = await api("GET", `/api/config/v2/data-types/${encodeURIComponent(typeId)}`, token);
    push(`Schema v2 → ${schema.status}`);
    if (schema.status < 400) {
      push("```json");
      push(JSON.stringify(redactDeep(schema.json), null, 2));
      push("```");
      for (const key of collectKeys(schema.json)) allColumns.add(key);
      walkTypes(schema.json);
    }

    const open = await api("POST", `/api/data/v2/${encodeURIComponent(typeId)}/query`, token, { pageSize: 20 });
    push(`Open query pageSize=20 → ${open.status}`);
    if (open.status >= 400) {
      push("");
      continue;
    }
    const openObj = open.json && typeof open.json === "object" ? (open.json as Record<string, unknown>) : {};
    if ("continuationToken" in openObj || "continuation" in openObj) continuationSeen = true;
    if (typeof openObj.totalCount === "number") pageSizeDefault = 20;
    const openEntities = extractEntities(open.json);
    push(`Open entities: ${openEntities.length}; totalCount=${String(openObj.totalCount ?? "?")}`);
    if (openEntities.length > 0) {
      bestTypeId = bestTypeId || typeId;
      summary.dataset = "PASS";
      const keys = [...collectKeys(openEntities.map(flattenAttributes))];
      for (const key of keys) allColumns.add(key);
      for (const target of Object.keys(FIELD_SYNONYMS) as TargetField[]) {
        if (!mapping[target]) {
          const hit = matchField(keys, target);
          if (hit) mapping[target] = hit;
        }
      }
      const blob = JSON.stringify(openEntities);
      for (const location of locationsWanted) {
        if (blob.toLowerCase().includes(location.toLowerCase())) foundLocations.add(location);
      }
      // Extra laadplaatsen via mappingveld
      if (mapping.loadingLocation) {
        for (const entity of openEntities) {
          const flat = flattenAttributes(entity);
          const value = flat[mapping.loadingLocation];
          if (typeof value === "string" && value.trim()) foundLocations.add(value.trim());
        }
      }
      push("Sample operationeel (max 2, alleen gemapte velden):");
      push("```json");
      push(
        JSON.stringify(
          openEntities.slice(0, 2).map((entity) => operationalSample(entity, mapping)),
          null,
          2,
        ),
      );
      push("```");
    }

    const dateFieldCandidates = [
      mapping.unloadingDate,
      "date",
      "Datum",
      "laaddatum",
      "Laaddatum",
      "loadingDate",
      "plannedDate",
      "planDatum",
      "dag",
      "Day",
    ].filter((value, index, all): value is string => Boolean(value) && all.indexOf(value) === index);

    for (const [label, day] of [
      ["morgen", tomorrow],
      ["vandaag", today],
    ] as const) {
      for (const field of dateFieldCandidates) {
        const filter = `${field} EQ ${JSON.stringify(day)}`;
        const queried = await api("POST", `/api/data/v2/${encodeURIComponent(typeId)}/query`, token, {
          filter,
          pageSize: 100,
        });
        if (queried.status >= 400) continue;
        const entities = extractEntities(queried.json);
        push(`- ${label} filter=\`${filter}\` → ${queried.status}, n=${entities.length}`);
        if (entities.length === 0) continue;
        bestTypeId = typeId;
        summary.dataset = "PASS";
        if (label === "morgen") {
          summary.tomorrowQuery = true;
          tomorrowFilter = filter;
        } else {
          summary.todayQuery = true;
          todayFilter = filter;
        }
        const keys = [...collectKeys(entities.map(flattenAttributes))];
        for (const key of keys) allColumns.add(key);
        for (const target of Object.keys(FIELD_SYNONYMS) as TargetField[]) {
          const hit = matchField(keys, target);
          if (hit) mapping[target] = hit;
        }
        const blob = JSON.stringify(entities);
        for (const location of locationsWanted) {
          if (blob.toLowerCase().includes(location.toLowerCase())) foundLocations.add(location);
        }
        if (mapping.loadingLocation) {
          for (const entity of entities) {
            const flat = flattenAttributes(entity);
            const value = flat[mapping.loadingLocation];
            if (typeof value === "string" && value.trim()) foundLocations.add(value.trim());
          }
        }
        push("Sample operationeel (max 2):");
        push("```json");
        push(
          JSON.stringify(
            entities.slice(0, 2).map((entity) => operationalSample(entity, mapping)),
            null,
            2,
          ),
        );
        push("```");
        break;
      }
    }
    push("");
  }

  summary.dataTypeId = bestTypeId;

  push("## Bronvolgorde / paginering");
  push("");
  push(`- continuationToken/continuation gezien: ${continuationSeen ? "ja" : "nee/onbekend"}`);
  push(`- pageSize gebruikt in probes: ${pageSizeDefault ?? 20}`);
  push("- Bronvolgorde: behoud array-volgorde van `entities`/`resources` zoals geretourneerd (geen herschikking).");
  push("");

  push("## Laadplaatsen in data");
  push("");
  for (const location of locationsWanted) {
    push(`- ${location}: ${foundLocations.has(location) ? "gevonden" : "niet gezien in samples"}`);
  }
  const extras = [...foundLocations].filter(
    (name) => !locationsWanted.some((wanted) => wanted.toLowerCase() === name.toLowerCase()),
  );
  if (extras.length) {
    push("- Aanvullend:");
    for (const name of extras) push(`  - ${name}`);
  } else {
    push("- Aanvullend: geen in samples");
  }
  push("");

  push("## Veldmapping (alleen aangetroffen)");
  push("");
  push("| Target | Bronveld | Aanwezig |");
  push("| --- | --- | --- |");
  for (const target of Object.keys(FIELD_SYNONYMS) as TargetField[]) {
    const source = mapping[target];
    push(`| ${target} | ${source ?? "_niet aangetroffen_"} | ${source ? "ja" : "nee"} |`);
  }
  push("");

  push("## Alle beschikbare kolommen (samples/schema, geredigeerd)");
  push("");
  push([...allColumns].sort().join(", ") || "(geen)");
  push("");

  push("## Summary");
  push("");
  push(`AUTH: ${summary.auth}`);
  push(`DATASET: ${summary.dataset}`);
  push(`dataTypeId: ${summary.dataTypeId || "(niet vastgesteld)"}`);
  push(`tomorrow query: vastgesteld ${summary.tomorrowQuery ? "ja" : "nee"}${tomorrowFilter ? ` (\`${tomorrowFilter}\`)` : ""}`);
  push(`today query: vastgesteld ${summary.todayQuery ? "ja" : "nee"}${todayFilter ? ` (\`${todayFilter}\`)` : ""}`);
  push(`TOTP required: ${summary.totpRequired}`);
  push("");
  push("## STOP");
  push("");
  push("Geen UI gebouwd. Secrets/tokens niet gelogd.");

  writeReport();
  console.log(`Wrote ${outPath}`);
  console.log(`AUTH: ${summary.auth}`);
  console.log(`DATASET: ${summary.dataset}`);
  console.log(`dataTypeId: ${summary.dataTypeId || "(niet vastgesteld)"}`);
  console.log(`tomorrow query: vastgesteld ${summary.tomorrowQuery ? "ja" : "nee"}`);
  console.log(`today query: vastgesteld ${summary.todayQuery ? "ja" : "nee"}`);
  if (summary.auth !== "PASS" || summary.dataset !== "PASS") process.exitCode = 1;
}

main().catch((error) => {
  console.error("Discovery failed:", error instanceof Error ? error.message : "unknown");
  process.exitCode = 1;
});
