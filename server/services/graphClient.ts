import { readFileSync } from "node:fs";
import path from "node:path";
import { ClientSecretCredential } from "@azure/identity";
import { appRoot } from "../appPaths.js";
import { logError, logInfo } from "../log.js";
import { getIntegrationSettings } from "./settingsService.js";

const GRAPH_SCOPE = "https://graph.microsoft.com/.default";
const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

function envFilePath() {
  return path.join(appRoot(), ".env");
}

type CachedToken = {
  token: string;
  expiresOn: number;
  key: string;
};

let envLoaded = false;
let credential: ClientSecretCredential | null = null;
let credentialKey = "";
let cachedToken: CachedToken | null = null;

function text(value: string | undefined) {
  return value?.trim() ?? "";
}

export function loadLocalEnv() {
  if (envLoaded) return;
  envLoaded = true;
  let raw = "";
  try {
    raw = readFileSync(envFilePath(), "utf8");
  } catch {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

function credentials() {
  loadLocalEnv();
  const stored = getIntegrationSettings().graph;
  const tenantId = text(process.env.GRAPH_TENANT_ID) || stored.tenantId;
  const clientId = text(process.env.GRAPH_CLIENT_ID) || stored.clientId;
  const clientSecret = text(process.env.GRAPH_CLIENT_SECRET) || stored.clientSecret;
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error("GRAPH_TENANT_ID, GRAPH_CLIENT_ID of GRAPH_CLIENT_SECRET ontbreekt.");
  }
  return { tenantId, clientId, clientSecret };
}

export function resetGraphCache() {
  credential = null;
  credentialKey = "";
  cachedToken = null;
}

export async function getGraphAccessToken() {
  const graph = credentials();
  const key = `${graph.tenantId}:${graph.clientId}`;
  if (cachedToken && cachedToken.key === key && cachedToken.expiresOn > Date.now() + 60_000) {
    return cachedToken.token;
  }
  if (!credential || credentialKey !== key) {
    credential = new ClientSecretCredential(graph.tenantId, graph.clientId, graph.clientSecret);
    credentialKey = key;
    cachedToken = null;
  }
  let access: { token: string; expiresOnTimestamp: number } | null;
  try {
    access = await credential.getToken(GRAPH_SCOPE);
  } catch (error) {
    const message = error instanceof Error ? error.message : "onbekende fout";
    logError(`Graph-authenticatie mislukt (${message.slice(0, 180)}).`);
    throw new Error("Microsoft Graph-token is niet bereikbaar.");
  }
  if (!access?.token || !Number.isFinite(access.expiresOnTimestamp)) {
    logError("Graph-token via client credentials is leeg.");
    throw new Error("Graph-token is ongeldig.");
  }
  cachedToken = { token: access.token, expiresOn: access.expiresOnTimestamp, key };
  logInfo(`Graph-token geldig tot ${new Date(access.expiresOnTimestamp).toISOString()}.`);
  return access.token;
}

async function graphError(response: Response) {
  const textBody = await response.text();
  try {
    const body = JSON.parse(textBody) as { error?: { code?: string; message?: string } };
    const detail = body.error?.message || body.error?.code;
    if (detail) return `Graph antwoordde met ${response.status}: ${detail.slice(0, 180)}`;
  } catch {
    // De statuscode blijft de fout.
  }
  return `Graph antwoordde met ${response.status}.`;
}

export function graphUrl(pathName: string, query?: Record<string, string>) {
  const url = new URL(pathName.startsWith("https://") ? pathName : `${GRAPH_BASE}${pathName}`);
  if (url.origin !== "https://graph.microsoft.com") throw new Error("Onverwacht Graph-adres.");
  if (query) {
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  }
  return url;
}

export async function graphGet(url: URL): Promise<unknown> {
  const token = await getGraphAccessToken();
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/json",
      },
      signal: AbortSignal.timeout(12_000),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "niet bereikbaar";
    console.error(`Graph-verzoek mislukt (${message.slice(0, 180)}).`);
    throw new Error("Microsoft Graph is niet bereikbaar.");
  }
  if (response.status === 401) {
    resetGraphCache();
    console.error(`Graph weigerde ${url.pathname} met 401.`);
  }
  if (!response.ok) {
    const message = await graphError(response);
    console.error(message);
    throw new Error(message);
  }
  return response.json();
}
