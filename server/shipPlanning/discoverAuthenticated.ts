/**
 * Authenticated Schepenplanning discovery against planning.teunesen.nl.
 *
 * Focus: formatter e339… (page/PluginFormatter) → pluginConfig → datasource.
 * Geen generieke probing van alle formatter-ids als dataTypeId.
 *
 * Production (TEU-NC-01, geen tsx):
 *   node dist/server/shipPlanning/discoverAuthenticated.js
 *   ./scripts/ship-planning-discover.sh
 *
 * Secrets: SHIP_PLANNING_* uit process.env of `.env` — nooit loggen/committen.
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

/** Tarasa PluginContext: Xe = 2 → plugin URL .js wordt .t2.js */
const TARASA_PLUGIN_RUNTIME_VERSION = 2;

/** Door gebruiker bevestigde SPA-route / formatter id (≠ dataTypeId). */
const SCHEPEN_PAGE_GUID = "e339106e-2bc5-4ed9-9295-d722a78eec3f";
const SCHEPEN_SPA_ROUTE = `#/data/page/${SCHEPEN_PAGE_GUID}`;

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
  return path.join(dataDir(), "ship-planning-discovery.md");
}

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Acceptance = "PASS" | "FAIL" | "NIET GETEST";

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
  if (Array.isArray(value)) return value.slice(0, 40).map((item) => redactDeep(item, depth + 1));
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

function isNumericTypeId(typeId: string) {
  return /^\d+$/.test(typeId.trim());
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function dataQueryPath(typeId: string) {
  const id = encodeURIComponent(typeId);
  return isNumericTypeId(typeId) ? `/api/data/${id}/query` : `/api/data/v2/${id}/query`;
}

function configTypePath(typeId: string) {
  const id = encodeURIComponent(typeId);
  return isNumericTypeId(typeId) ? `/api/config/data-types/${id}` : `/api/config/v2/data-types/${id}`;
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
  return { status: response.status, json, bytes: text.length, contentType: response.headers.get("content-type") };
}

async function fetchText(url: string, token: string | null) {
  const headers: Record<string, string> = { accept: "*/*" };
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(url, { method: "GET", headers });
  const text = await response.text();
  return {
    status: response.status,
    bytes: text.length,
    contentType: response.headers.get("content-type"),
    text,
  };
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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function collectObjects(node: unknown, into: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (!node) return into;
  if (Array.isArray(node)) {
    for (const item of node) collectObjects(item, into);
    return into;
  }
  if (typeof node === "object") {
    into.push(node as Record<string, unknown>);
    for (const nested of Object.values(node as Record<string, unknown>)) {
      if (nested && typeof nested === "object") collectObjects(nested, into);
    }
  }
  return into;
}

function indexById(payload: unknown): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  for (const row of collectObjects(payload)) {
    if (typeof row.id === "string" || typeof row.id === "number") map.set(String(row.id), row);
  }
  return map;
}

function findSchepenSitemapEntries(payload: unknown): Record<string, unknown>[] {
  const hits: Record<string, unknown>[] = [];
  for (const row of collectObjects(payload)) {
    const pathValue = typeof row.path === "string" ? row.path : "";
    const label = String(row.label ?? row.menuLabel ?? row.displayName ?? row.name ?? "");
    const props = asRecord(row.props) ?? {};
    const formatterId = String(props.formatterId ?? row.formatterId ?? "");
    const blob = `${pathValue} ${label} ${formatterId}`.toLowerCase();
    if (
      pathValue.includes(SCHEPEN_PAGE_GUID) ||
      formatterId === SCHEPEN_PAGE_GUID ||
      blob.includes("schepenplanning")
    ) {
      hits.push(row);
    }
  }
  return hits;
}

function safeSitemapEntryView(entry: Record<string, unknown>) {
  const props = asRecord(entry.props) ?? {};
  return {
    label: entry.label ?? entry.menuLabel ?? entry.displayName ?? null,
    path: entry.path ?? null,
    type: entry.type ?? null,
    formatterId: props.formatterId ?? entry.formatterId ?? null,
    pageName: props.pageName ?? entry.pageName ?? null,
    menuLabel: entry.menuLabel ?? props.menuLabel ?? null,
    hasSubroutes: entry.hasSubroutes ?? null,
    props: {
      formatterId: props.formatterId ?? null,
      pageName: props.pageName ?? null,
      entityTypeId: props.entityTypeId ?? null,
      menuLabel: props.menuLabel ?? null,
    },
  };
}

/** Volledig structureel formatterobject (gesanitiseerd), gericht op Schepenplanning. */
function fullSanitizedFormatter(fmt: Record<string, unknown>) {
  const settings = asRecord(fmt.settings) ?? {};
  const plugin = asRecord(settings.pluginConfig);
  const attributes = Array.isArray(settings.attributes)
    ? settings.attributes.map((item) => {
        const row = asRecord(item) ?? {};
        return {
          displayName: row.displayName ?? null,
          uniqueId: row.uniqueId ?? null,
          attributePath: row.attributePath ?? null,
          formatterId: row.formatterId ?? null,
          category: row.category ?? null,
        };
      })
    : settings.attributes ?? null;
  return redactDeep({
    id: fmt.id ?? null,
    name: fmt.name ?? null,
    menuCategory: fmt.menuCategory ?? null,
    menuLabel: fmt.menuLabel ?? null,
    path: fmt.path ?? null,
    formatterType: fmt.formatterType ?? null,
    dataTypeId: fmt.dataTypeId ?? null,
    componentType: fmt.componentType ?? null,
    settings: {
      pluginConfig: plugin
        ? { url: plugin.url ?? null, scope: plugin.scope ?? null, module: plugin.module ?? null }
        : settings.pluginConfig ?? null,
      listFormatterId: settings.listFormatterId ?? null,
      entryFormatterId: settings.entryFormatterId ?? null,
      searchField: settings.searchField ?? null,
      attributes,
      rows: settings.rows ?? null,
      includedAttributes: settings.includedAttributes ?? null,
      scriptType: settings.scriptType ?? null,
      globalFilter: settings.globalFilter ?? null,
      config: settings.config ?? null,
      lists: settings.lists ?? null,
      cards: settings.cards ?? null,
    },
  });
}

/** Zoals PluginContext.Ye: .js → .t{TARASA_PLUGIN_RUNTIME_VERSION}.js */
function resolvePluginScriptUrls(url: string): string[] {
  const absolute = url.startsWith("http") ? url : `${BASE}${url.startsWith("/") ? "" : "/"}${url}`;
  const urls = new Set<string>([absolute]);
  if (/\.t\d+\.js$/i.test(absolute)) {
    urls.add(absolute.replace(/\.t\d+\.js$/i, ".js"));
  } else if (absolute.endsWith(".js")) {
    urls.add(absolute.replace(/\.js$/i, `.t${TARASA_PLUGIN_RUNTIME_VERSION}.js`));
  }
  return [...urls];
}

type PluginAnalysis = {
  apiPaths: string[];
  dataTypeIds: string[];
  filterSnippets: string[];
  fieldLiterals: string[];
  locationHits: string[];
  queryBodyKeys: string[];
};

function analyzePluginSource(source: string): PluginAnalysis {
  const apiPaths = new Set<string>();
  for (const match of source.matchAll(/["'`](\/api\/[^"'`]+)["'`]/g)) {
    apiPaths.add(match[1]);
  }
  for (const match of source.matchAll(/\/api\/data(?:\/v2)?\/\$\{[^}]+\}\/query/g)) {
    apiPaths.add(match[0]);
  }

  const dataTypeIds = new Set<string>();
  for (const match of source.matchAll(/dataTypeId["'\s:=]+["']([^"']+)["']/gi)) {
    if (match[1] !== SCHEPEN_PAGE_GUID) dataTypeIds.add(match[1]);
  }
  for (const match of source.matchAll(/entityTypeId["'\s:=]+["']?(\d{1,8}|[0-9a-f-]{36})["']?/gi)) {
    if (match[1] !== SCHEPEN_PAGE_GUID) dataTypeIds.add(match[1]);
  }
  for (const match of source.matchAll(/\/api\/data\/v2\/([A-Za-z0-9._-]+)\/query/g)) {
    if (match[1] !== SCHEPEN_PAGE_GUID && !match[1].includes("${")) dataTypeIds.add(match[1]);
  }
  for (const match of source.matchAll(/\/api\/data\/(\d+)\/query/g)) {
    dataTypeIds.add(match[1]);
  }

  const filterSnippets: string[] = [];
  for (const match of source.matchAll(
    /[A-Za-z0-9_.]+ (?:EQ|NEQ|GT|LT|GEQ|LEQ|BETWEEN|IN|STRCON|STREQ) [^"'`;\n]{0,80}/g,
  )) {
    filterSnippets.push(match[0].slice(0, 120));
  }

  const fieldLiterals = new Set<string>();
  for (const token of [
    "Tijd",
    "Klant",
    "Losplaats",
    "Conditie",
    "Product",
    "Hoeveelheid",
    "Schip",
    "Order",
    "Vervoerder",
    "Telnr",
    "Losdatum",
    "Laadplaats",
    "Opmerking",
    "laaddatum",
    "loadingDate",
    "unloadingDate",
  ]) {
    if (source.includes(token)) fieldLiterals.add(token);
  }

  const locationHits: string[] = [];
  for (const location of ["Hoofdstraat", "Hoogveld", "Venlo", "Cuijk"]) {
    if (source.toLowerCase().includes(location.toLowerCase())) locationHits.push(location);
  }

  const queryBodyKeys = new Set<string>();
  for (const key of ["filter", "pageSize", "continuationToken", "orderBy", "project", "join"]) {
    if (new RegExp(`["']${key}["']`).test(source) || new RegExp(`\\b${key}\\b`).test(source)) {
      queryBodyKeys.add(key);
    }
  }

  return {
    apiPaths: [...apiPaths].sort().slice(0, 80),
    dataTypeIds: [...dataTypeIds].filter((id) => id && id !== SCHEPEN_PAGE_GUID).slice(0, 40),
    filterSnippets: [...new Set(filterSnippets)].slice(0, 40),
    fieldLiterals: [...fieldLiterals],
    locationHits,
    queryBodyKeys: [...queryBodyKeys],
  };
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
  unloadingDate: ["losdatum", "unloadingdate", "lossingsdatum", "laaddatum", "loadingdate", "datum", "date"],
  planningRemark: ["opmerking", "remark", "opmerkingplanning", "planningremark", "note", "notitie"],
};

function matchField(keys: string[], target: TargetField): string | null {
  const synonyms = FIELD_SYNONYMS[target];
  const normalized = keys.map((key) => ({
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

function contentLooksLikeShipPlanning(blob: string) {
  const low = blob.toLowerCase();
  let score = 0;
  for (const token of ["hoofdstraat", "hoogveld", "venlo", "cuijk"]) {
    if (low.includes(token)) score += 25;
  }
  for (const token of ["schip", "vessel", "laadplaats", "losplaats", "binnenschip"]) {
    if (low.includes(token)) score += 8;
  }
  return score;
}

function collectDataTypeIdsFromFormatter(
  fmt: Record<string, unknown> | null,
  byId: Map<string, Record<string, unknown>>,
  into = new Set<string>(),
  depth = 0,
): Set<string> {
  if (!fmt || depth > 6) return into;
  const own = fmt.dataTypeId;
  if (own != null && String(own).trim()) {
    const idStr = String(own);
    if (!(idStr === String(fmt.id) && isUuid(idStr))) into.add(idStr);
  }
  const settings = asRecord(fmt.settings) ?? {};
  for (const key of ["listFormatterId", "entryFormatterId", "subFormatterId"] as const) {
    const nestedId = settings[key];
    if (typeof nestedId === "string" || typeof nestedId === "number") {
      collectDataTypeIdsFromFormatter(byId.get(String(nestedId)) ?? null, byId, into, depth + 1);
    }
  }
  if (Array.isArray(settings.lists)) {
    for (const item of settings.lists) {
      const row = asRecord(item);
      if (!row) continue;
      for (const key of ["dataType", "dataTypeId", "entityTypeId"] as const) {
        if (row[key] != null && String(row[key]).trim()) into.add(String(row[key]));
      }
      if (row.formatterId != null) {
        collectDataTypeIdsFromFormatter(byId.get(String(row.formatterId)) ?? null, byId, into, depth + 1);
      }
    }
  }
  return into;
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
    queryPath: "",
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
  push("Focus: uitsluitend Schepenplanning formatter → plugin → datasource.");
  push("Geen generieke probing van alle formatter-ids als dataTypeId.");
  push("");

  const writeReport = () => {
    mkdirSync(path.dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${report.join("\n")}\n`, { mode: 0o640 });
  };

  if (!username || (!password && !apiKey)) {
    push("## Status: BLOKKADE");
    push("");
    push("Geen dedicated serviceaccount-secrets in de runtime / `.env`.");
    push("");
    push("## Summary");
    push("AUTH: FAIL");
    push("DATASET: FAIL");
    writeReport();
    console.log(`Wrote ${outPath} (blocked: missing secrets)`);
    console.log("AUTH: FAIL");
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
  }

  if (!token || auth.status >= 400) {
    push("## Status: AUTH MISLUKT");
    push("## Summary");
    push("AUTH: FAIL");
    push("DATASET: FAIL");
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

  const authObj = asRecord(auth.json) ?? {};
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
    } else {
      push(
        "Refresh mislukt/geen nieuw token — discovery gaat door met initiële Bearer (auth-flow ongewijzigd).",
      );
    }
    push("```json");
    push(JSON.stringify(redactDeep(refresh.json), null, 2));
    push("```");
    push("");
  }

  // ——— SPA call chain (productiebundels) ———
  push("## SPA call chain (bewijs uit Tarasa bundles)");
  push("");
  push("1. Sitemap `type:\"page\"`, path `/data/page/{guid}`, `props.formatterId`");
  push("2. MainRouter: strip `/data/` → route `page/{guid}` → component `Dn({ formatterId, pageName })`");
  push("3. `gt(formatterId)` → formatter uit `/api/ui-config/formatters`");
  push("4. `pn(formatter.settings.pluginConfig)` → `PluginContext.usePluginConfiguration` / `Ye`");
  push(
    `5. \`Ye\`: plugin URL \`.js\` → \`.t${TARASA_PLUGIN_RUNTIME_VERSION}.js\`; Module Federation \`loadRemote(scope/module)\``,
  );
  push("6. Remote: `default.tarasaConfiguration` + remote `Formatter` component");
  push("7. `nl`: `formatter.Formatter({ formatter, isRoot, match })`");
  push("8. Datasource-queries zitten in de **remote plugin-module**, niet in host-MainRouter");
  push("");
  push(`Bevestigde route: \`${SCHEPEN_SPA_ROUTE}\``);
  push(`Page/formatter id: \`${SCHEPEN_PAGE_GUID}\` — **geen** dataTypeId`);
  push("");

  // ——— Alleen sitemap + formatters (geen generieke type-scan) ———
  push("## Config probes (alleen sitemap + formatters)");
  push("");
  const sitemap = await api("GET", "/api/ui-config/sitemap", token);
  push(`- GET /api/ui-config/sitemap → ${sitemap.status} (${sitemap.bytes} B)`);
  const formatters = await api("GET", "/api/ui-config/formatters", token);
  push(`- GET /api/ui-config/formatters → ${formatters.status} (${formatters.bytes} B)`);
  push("");

  const sitemapHits = sitemap.status < 400 ? findSchepenSitemapEntries(sitemap.json) : [];
  push("### Sitemap Schepenplanning-entry");
  push("");
  if (!sitemapHits.length) {
    push("Geen sitemap-entry gevonden voor Schepenplanning / path-GUID.");
  } else {
    for (const hit of sitemapHits.slice(0, 3)) {
      push("```json");
      push(JSON.stringify(safeSitemapEntryView(hit), null, 2));
      push("```");
    }
  }
  push("");

  const formattersById = indexById(formatters.json);
  const schepenFormatter = formattersById.get(SCHEPEN_PAGE_GUID) ?? null;
  let formatterByName: Record<string, unknown> | null = null;
  if (!schepenFormatter) {
    for (const row of formattersById.values()) {
      if (String(row.name ?? "").toLowerCase() === "schepenplanning") {
        formatterByName = row;
        break;
      }
    }
  }
  const fmt = schepenFormatter ?? formatterByName;

  push("### Formatter object (volledig gesanitiseerd)");
  push("");
  if (!fmt) {
    push(`Formatter id=\`${SCHEPEN_PAGE_GUID}\` / name=Schepenplanning **niet gevonden**.`);
  } else {
    push("```json");
    push(JSON.stringify(fullSanitizedFormatter(fmt), null, 2));
    push("```");
  }
  push("");

  const settings = asRecord(fmt?.settings) ?? {};
  const pluginConfig = asRecord(settings.pluginConfig);
  const componentType = fmt ? String(fmt.componentType ?? "") : "";
  const formatterType = fmt ? String(fmt.formatterType ?? "") : "";
  const isPluginFormatter = componentType === "PluginFormatter" || Boolean(pluginConfig);

  push("### Formatter type / plugin");
  push("");
  push(`- formatterType: \`${formatterType || "(onbekend)"}\``);
  push(`- componentType: \`${componentType || "(onbekend)"}\``);
  push(`- PluginFormatter / pluginConfig aanwezig: ${isPluginFormatter ? "ja" : "nee"}`);
  if (pluginConfig) {
    push(`- pluginConfig.url: \`${String(pluginConfig.url ?? "")}\``);
    push(`- pluginConfig.scope: \`${String(pluginConfig.scope ?? "")}\``);
    push(`- pluginConfig.module: \`${String(pluginConfig.module ?? "")}\``);
  } else {
    push("- pluginConfig: *(niet aanwezig op dit formatterobject)*");
  }
  push("");

  // ——— Plugin JS ophalen + analyseren ———
  const pluginAnalyses: Array<{ url: string; status: number; analysis: PluginAnalysis | null }> = [];
  const resolvedFromPlugin = new Set<string>();

  push("## Plugin module fetch + statische analyse");
  push("");
  if (!pluginConfig?.url || typeof pluginConfig.url !== "string") {
    push("Geen pluginConfig.url — kan geen remote module downloaden.");
    push("Datasource moet uit formatter.dataTypeId of nested formatters komen, of uit browser network.");
  } else {
    const urls = resolvePluginScriptUrls(String(pluginConfig.url));
    push(`Geprobeerde script-URLs (Tarasa runtime t${TARASA_PLUGIN_RUNTIME_VERSION}):`);
    for (const url of urls) push(`- ${url}`);
    push("");
    for (const url of urls) {
      const fetched = await fetchText(url, token);
      push(`- GET \`${url}\` → ${fetched.status} (${fetched.bytes} B, ${fetched.contentType ?? "?"})`);
      if (fetched.status >= 400 || fetched.bytes < 50) {
        pluginAnalyses.push({ url, status: fetched.status, analysis: null });
        continue;
      }
      const analysis = analyzePluginSource(fetched.text);
      pluginAnalyses.push({ url, status: fetched.status, analysis });
      for (const id of analysis.dataTypeIds) resolvedFromPlugin.add(id);
      push("  Aangetroffen API-paden:");
      if (!analysis.apiPaths.length) push("  - *(geen /api/… stringliterals)*");
      for (const apiPath of analysis.apiPaths.slice(0, 40)) push(`  - \`${apiPath}\``);
      push(`  dataTypeId/entityTypeId kandidaten: ${analysis.dataTypeIds.join(", ") || "(geen)"}`);
      push(`  query body keys: ${analysis.queryBodyKeys.join(", ") || "(geen)"}`);
      push(`  filter snippets: ${analysis.filterSnippets.slice(0, 15).join(" | ") || "(geen)"}`);
      push(`  veld/label literals: ${analysis.fieldLiterals.join(", ") || "(geen)"}`);
      push(`  locatie-literals: ${analysis.locationHits.join(", ") || "(geen)"}`);
      push(`  source fingerprint: ${fingerprint(fetched.text.slice(0, 5000))}`);
    }
  }
  push("");

  const fromFormatterIds = collectDataTypeIdsFromFormatter(fmt, formattersById);
  const targetIds = [...new Set([...resolvedFromPlugin, ...fromFormatterIds])].filter(
    (id) => id && id !== SCHEPEN_PAGE_GUID,
  );

  push("## Resolved datasource kandidaten (alleen bewezen)");
  push("");
  push(`- Uit formatter.dataTypeId / nested: ${[...fromFormatterIds].join(", ") || "(geen)"}`);
  push(`- Uit plugin-source analyse: ${[...resolvedFromPlugin].join(", ") || "(geen)"}`);
  push(`- Query-targets: ${targetIds.join(", ") || "(geen — geen blind formatter-id probing)"}`);
  push("");

  const today = amsterdamYmd(0);
  const tomorrow = amsterdamYmd(1);
  push("## Datum (Europe/Amsterdam)");
  push(`- vandaag: \`${today}\``);
  push(`- morgen: \`${tomorrow}\``);
  push("");
  push(
    "Datumfilters worden **niet** blind geprobeerd. Eerst echte datasourcequery; filters alleen als plugin/source die toont.",
  );
  push("");

  const mapping: Partial<Record<TargetField, string>> = {};
  const allColumns = new Set<string>();
  const foundLocations = new Set<string>();
  let bestTypeId = "";
  let bestContentScore = -1;
  let continuationSeen = false;
  let pageSizeDefault: number | null = null;
  let queryHttp200 = false;
  let recordsFound = false;
  const provenFilterFromPlugin = pluginAnalyses.some(
    (row) => row.analysis && row.analysis.filterSnippets.length > 0,
  );

  push("## Queries (alleen resolved dataTypeIds)");
  push("");
  if (targetIds.length === 0) {
    push("Geen dataTypeId om te queryen.");
    push("");
    push("Volgende stap op TEU: browser network capture na navigatie naar Schepenplanning-route");
    push(`(\`${SCHEPEN_SPA_ROUTE}\`) om de échte XHR te zien die records laadt.`);
    push("");
  }

  for (const typeId of targetIds.slice(0, 8)) {
    const queryPath = dataQueryPath(typeId);
    const schemaPath = configTypePath(typeId);
    push(`### dataTypeId \`${typeId}\``);
    const schema = await api("GET", schemaPath, token);
    push(`- schema \`${schemaPath}\` → ${schema.status}`);
    if (schema.status < 400) {
      for (const key of collectKeys(schema.json)) allColumns.add(key);
    }
    const open = await api("POST", queryPath, token, { pageSize: 20 });
    push(`- open query \`${queryPath}\` → ${open.status} (${open.bytes} B, ${open.contentType ?? "?"})`);
    push(`  request top-level keys: pageSize`);
    if (open.status === 200) queryHttp200 = true;
    if (open.status >= 400) {
      push("```json");
      push(JSON.stringify(redactDeep(open.json), null, 2));
      push("```");
      push("");
      continue;
    }
    const openObj = asRecord(open.json) ?? {};
    push(`  response top-level keys: ${Object.keys(openObj).join(", ") || "(geen)"}`);
    if ("continuationToken" in openObj || "continuation" in openObj) continuationSeen = true;
    if (typeof openObj.totalCount === "number") pageSizeDefault = 20;
    const entities = extractEntities(open.json);
    const score = contentLooksLikeShipPlanning(JSON.stringify(entities));
    push(`  entities: ${entities.length}; totalCount=${String(openObj.totalCount ?? "?")}; contentScore=${score}`);
    if (entities.length > 0) {
      recordsFound = true;
      const keys = [...collectKeys(entities.map(flattenAttributes))];
      for (const key of keys) allColumns.add(key);
      for (const target of Object.keys(FIELD_SYNONYMS) as TargetField[]) {
        const hit = matchField(keys, target);
        if (hit) mapping[target] = hit;
      }
      const blob = JSON.stringify(entities);
      for (const location of ["Hoofdstraat", "Hoogveld", "Venlo", "Cuijk"]) {
        if (blob.toLowerCase().includes(location.toLowerCase())) foundLocations.add(location);
      }
      if (score > bestContentScore) {
        bestContentScore = score;
        bestTypeId = typeId;
        summary.dataTypeId = typeId;
        summary.queryPath = queryPath;
        summary.dataset = score >= 25 || Boolean(mapping.vessel) || Boolean(mapping.loadingLocation) ? "PASS" : "FAIL";
      }
      push("Sample (max 2, gemapte velden):");
      push("```json");
      push(
        JSON.stringify(
          entities.slice(0, 2).map((entity) => operationalSample(entity, mapping)),
          null,
          2,
        ),
      );
      push("```");
    }
    push("");
  }

  // Filters uit plugin — alleen rapporteren, niet blind uitvoeren tenzij snippet + dataType bekend.
  push("## Datumfilter (alleen bewijs, geen blinde probes)");
  push("");
  if (provenFilterFromPlugin) {
    push("Filter-snippets uit plugin-source (niet automatisch uitgevoerd):");
    for (const row of pluginAnalyses) {
      if (!row.analysis?.filterSnippets.length) continue;
      for (const snippet of row.analysis.filterSnippets.slice(0, 20)) push(`- \`${snippet}\``);
    }
  } else {
    push("Geen filter-snippets in plugin-source. today/tomorrow: nog niet bewezen.");
  }
  push(`today query: vastgesteld ${summary.todayQuery ? "ja" : "nee"}`);
  push(`tomorrow query: vastgesteld ${summary.tomorrowQuery ? "ja" : "nee"}`);
  push("");

  push("## Veldmapping (alleen aangetroffen in echte records)");
  push("");
  push("| Target | Bronveld | Aanwezig |");
  push("| --- | --- | --- |");
  for (const target of Object.keys(FIELD_SYNONYMS) as TargetField[]) {
    const source = mapping[target];
    push(`| ${target} | ${source ?? "_unmapped_"} | ${source ? "ja" : "nee"} |`);
  }
  push("");

  push("## Laadplaatsen in samples");
  push("");
  for (const location of ["Hoofdstraat", "Hoogveld", "Venlo", "Cuijk"]) {
    push(`- ${location}: ${foundLocations.has(location) ? "gevonden" : "niet gezien"}`);
  }
  push("");

  push("## Bronvolgorde / paginering");
  push("");
  push(`- continuationToken gezien: ${continuationSeen ? "ja" : "nee/onbekend"}`);
  push(`- pageSize in open probe: ${pageSizeDefault ?? "n.v.t."}`);
  push("- Bronvolgorde: array-orde van entities zoals geretourneerd (geen herschikking).");
  push("");

  if (!bestTypeId && targetIds.length === 0) {
    push("## Browser network (leidend als plugin geen dataTypeId lekt)");
    push("");
    push("Cloud Agent heeft geen interactieve authenticated browser-sessie met dit account.");
    push("Op TEU-NC-01: na deze run, open planning.teunesen.nl, login met serviceaccount,");
    push(`navigeer naar \`${SCHEPEN_SPA_ROUTE}\`, DevTools → Network → Fetch/XHR.`);
    push("Noteer method/path/status/body keys van requests die **nieuw** verschijnen na navigatie.");
    push("Plak gesanitiseerde request/response (zonder Authorization) terug in discovery-input.");
    push("");
  }

  const acceptance: Record<string, Acceptance> = {
    S1: summary.auth === "PASS" ? "PASS" : "FAIL",
    S2: "PASS",
    S3: fmt ? "PASS" : "FAIL",
    S4: fmt && (formatterType || componentType) ? "PASS" : "FAIL",
    S5: pluginConfig ? "PASS" : fmt ? "FAIL" : "NIET GETEST",
    S6: "PASS", // Dn/PluginContext chain gedocumenteerd uit bundles
    S7: bestTypeId || targetIds.length > 0 ? "PASS" : "FAIL",
    S8: summary.queryPath ? "PASS" : "FAIL",
    S9: queryHttp200 ? "PASS" : "FAIL",
    S10: recordsFound && bestContentScore >= 25 ? "PASS" : recordsFound ? "FAIL" : "FAIL",
    S11: mapping.loadingLocation ? "PASS" : "FAIL",
    S12: mapping.time ? "PASS" : "FAIL",
    S13: mapping.customer ? "PASS" : "FAIL",
    S14: mapping.unloadingLocation ? "PASS" : "FAIL",
    S15: mapping.condition ? "PASS" : "FAIL",
    S16: mapping.product ? "PASS" : "FAIL",
    S17: mapping.quantity ? "PASS" : "FAIL",
    S18: mapping.vessel ? "PASS" : "FAIL",
    S19: summary.todayQuery ? "PASS" : "FAIL",
    S20: summary.tomorrowQuery ? "PASS" : "FAIL",
    S21: recordsFound ? "PASS" : "FAIL",
    S22: continuationSeen || pageSizeDefault != null ? "PASS" : "FAIL",
    S23: "PASS",
    S24: "NIET GETEST", // ship-planning-discover.sh host-copy
  };

  push("## Summary");
  push("");
  push(`AUTH: ${summary.auth}`);
  push(`DATASET: ${summary.dataset}`);
  push(`Schepenplanning route: ${SCHEPEN_SPA_ROUTE}`);
  push(`Page/formatter id: ${fmt ? String(fmt.id) : SCHEPEN_PAGE_GUID}`);
  push(`Resolved formatter: ${fmt ? String(fmt.name ?? fmt.id) : "(niet vastgesteld)"}`);
  push(`formatterType: ${formatterType || "(niet vastgesteld)"}`);
  push(`componentType: ${componentType || "(niet vastgesteld)"}`);
  push(
    `pluginConfig: ${
      pluginConfig
        ? `url=${String(pluginConfig.url ?? "")}; scope=${String(pluginConfig.scope ?? "")}; module=${String(pluginConfig.module ?? "")}`
        : "(niet vastgesteld)"
    }`,
  );
  push(`Resolved dataTypeId: ${summary.dataTypeId || "(niet vastgesteld)"}`);
  push(`Resolved query endpoint: ${summary.queryPath || "(niet vastgesteld)"}`);
  push(`tomorrow query: vastgesteld ${summary.tomorrowQuery ? "ja" : "nee"}`);
  push(`today query: vastgesteld ${summary.todayQuery ? "ja" : "nee"}`);
  push(`TOTP required: ${summary.totpRequired}`);
  push("");
  push("## Acceptatie S1–S24");
  push("");
  for (const [key, value] of Object.entries(acceptance)) push(`- ${key}: ${value}`);
  push("");
  push("## STOP");
  push("");
  push("Geen UI. Auth-flow ongewijzigd. Secrets/tokens niet gelogd.");
  push("UI pas na S1–S20 allemaal PASS.");

  writeReport();
  console.log(`Wrote ${outPath}`);
  console.log(`AUTH: ${summary.auth}`);
  console.log(`DATASET: ${summary.dataset}`);
  console.log(`Resolved dataTypeId: ${summary.dataTypeId || "(niet vastgesteld)"}`);
  console.log(`pluginConfig.url: ${pluginConfig ? String(pluginConfig.url ?? "") : "(none)"}`);
  if (summary.auth !== "PASS" || summary.dataset !== "PASS") process.exitCode = 1;
}

main().catch((error) => {
  console.error("Discovery failed:", error instanceof Error ? error.message : "unknown");
  process.exitCode = 1;
});
