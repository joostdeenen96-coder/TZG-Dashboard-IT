/**
 * Gedeelde Tarasa-client voor Schepenplanning.
 * Zelfde login als discoverAuthenticated: POST /api/user-access/authenticate.
 * Credentials alleen uit SHIP_PLANNING_USERNAME / SHIP_PLANNING_PASSWORD.
 * Token en wachtwoord worden niet gelogd.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { appRoot } from "../appPaths.js";

const SECRET_ENV_KEYS = [
  "SHIP_PLANNING_USERNAME",
  "SHIP_PLANNING_PASSWORD",
  "SHIP_PLANNING_TOTP_SECRET",
  "SHIP_PLANNING_API_KEY",
  "SHIP_PLANNING_BASE_URL",
] as const;

export function loadShipPlanningEnvFile() {
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

export function shipPlanningBaseUrl() {
  return (process.env.SHIP_PLANNING_BASE_URL || "https://planning.teunesen.nl").replace(/\/$/, "");
}

export function shipPlanningCredentialsConfigured() {
  return Boolean(process.env.SHIP_PLANNING_USERNAME?.trim() && process.env.SHIP_PLANNING_PASSWORD?.trim());
}

export type ShipPlanningHttpResult = {
  status: number;
  json: unknown;
  bytes: number;
  contentType: string | null;
};

export async function shipPlanningApi(
  method: string,
  pathname: string,
  token: string | null,
  body?: unknown,
  fetchImpl: typeof fetch = fetch,
): Promise<ShipPlanningHttpResult> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  const response = await fetchImpl(`${shipPlanningBaseUrl()}${pathname}`, {
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
  return {
    status: response.status,
    json,
    bytes: text.length,
    contentType: response.headers.get("content-type"),
  };
}

export function extractToken(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const row = payload as Record<string, unknown>;
  if (typeof row.token === "string" && row.token) return row.token;
  if (typeof row.accessToken === "string" && row.accessToken) return row.accessToken;
  if (row.authToken && typeof row.authToken === "object") {
    const nested = row.authToken as Record<string, unknown>;
    if (typeof nested.token === "string" && nested.token) return nested.token;
  }
  return null;
}

export function looksLikeTotpRequired(payload: unknown, status: number) {
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

export type ShipPlanningLogin = {
  status: number;
  json: unknown;
  token: string | null;
  totpRequired: "yes" | "no" | "unknown";
};

/** Zelfde body als de SPA: { username, password, totp? }. TOTP alleen als het secret gezet is. */
export async function authenticateShipPlanning(fetchImpl: typeof fetch = fetch): Promise<ShipPlanningLogin> {
  const username = process.env.SHIP_PLANNING_USERNAME?.trim() || "";
  const password = process.env.SHIP_PLANNING_PASSWORD?.trim() || "";
  const totp = process.env.SHIP_PLANNING_TOTP_SECRET?.trim() || "";
  if (!username || !password) {
    return { status: 0, json: null, token: null, totpRequired: "unknown" };
  }
  const loginBody: Record<string, string> = { username, password };
  if (totp) loginBody.totp = totp;
  const auth = await shipPlanningApi("POST", "/api/user-access/authenticate", null, loginBody, fetchImpl);
  const token = extractToken(auth.json);
  let totpRequired: ShipPlanningLogin["totpRequired"] = "unknown";
  if ((!token || auth.status >= 400) && !totp && looksLikeTotpRequired(auth.json, auth.status)) {
    totpRequired = "yes";
  } else if (token && auth.status < 400 && !totp) {
    totpRequired = "no";
  }
  return { status: auth.status, json: auth.json, token: token && auth.status < 400 ? token : null, totpRequired };
}
