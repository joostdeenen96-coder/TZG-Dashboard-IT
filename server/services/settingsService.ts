import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const settingsFile = path.join(root, "data", "settings.json");

const DEFAULT_SITE = "https://teunesen.sharepoint.com/sites/Facturatie";
const DEFAULT_LIST = "Dieseltoeslagen Asvervoer";
const DEFAULT_USER = "admin";
const DEFAULT_PASSWORD = "teunesen";

type StoredSettings = {
  adminPasswordHash?: string;
  graph?: {
    tenantId?: string;
    clientId?: string;
    clientSecret?: string;
  };
  sharepoint?: {
    siteUrl?: string;
    listName?: string;
  };
  prtg?: {
    baseUrl?: string;
    username?: string;
    password?: string;
    groupId?: string;
    tag?: string;
  };
};

export type PublicSettings = {
  graph: {
    tenantId: string;
    clientId: string;
    clientSecretSet: boolean;
  };
  sharepoint: {
    siteUrl: string;
    listName: string;
  };
  prtg: {
    baseUrl: string;
    username: string;
    passwordSet: boolean;
    groupId: string;
    tag: string;
  };
};

export type GraphCredentials = {
  tenantId: string;
  clientId: string;
  clientSecret: string;
};

export type IntegrationSettings = PublicSettings & {
  graph: PublicSettings["graph"] & { clientSecret: string };
  prtg: PublicSettings["prtg"] & { password: string };
};

function readStored(): StoredSettings {
  try {
    const parsed: unknown = JSON.parse(readFileSync(settingsFile, "utf8"));
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as StoredSettings;
  } catch {
    return {};
  }
}

function writeStored(settings: StoredSettings) {
  mkdirSync(path.dirname(settingsFile), { recursive: true });
  writeFileSync(settingsFile, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 32).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

function passwordMatches(password: string, stored: StoredSettings) {
  const encoded = stored.adminPasswordHash;
  if (!encoded) return password === DEFAULT_PASSWORD;
  const [kind, salt, hash] = encoded.split("$");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const actual = scryptSync(password, salt, 32);
  const expected = Buffer.from(hash, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function adminUsername() {
  return DEFAULT_USER;
}

export function checkAdminLogin(username: string, password: string) {
  if (username.trim() !== DEFAULT_USER) return false;
  return passwordMatches(password, readStored());
}

export function getIntegrationSettings(): IntegrationSettings {
  const stored = readStored();
  const tenantId = text(stored.graph?.tenantId) || text(process.env.GRAPH_TENANT_ID);
  const clientId = text(stored.graph?.clientId) || text(process.env.GRAPH_CLIENT_ID);
  const clientSecret = text(stored.graph?.clientSecret) || text(process.env.GRAPH_CLIENT_SECRET);
  const prtgPassword = text(stored.prtg?.password) || text(process.env.PRTG_PASSWORD);
  return {
    graph: {
      tenantId,
      clientId,
      clientSecret,
      clientSecretSet: clientSecret.length > 0,
    },
    sharepoint: {
      siteUrl: text(stored.sharepoint?.siteUrl, DEFAULT_SITE) || DEFAULT_SITE,
      listName: text(stored.sharepoint?.listName, DEFAULT_LIST) || DEFAULT_LIST,
    },
    prtg: {
      baseUrl: text(stored.prtg?.baseUrl) || text(process.env.PRTG_BASE_URL),
      username: text(stored.prtg?.username) || text(process.env.PRTG_USERNAME) || "Beheert",
      password: prtgPassword,
      passwordSet: prtgPassword.length > 0 || text(process.env.PRTG_PASSHASH).length > 0,
      groupId: text(stored.prtg?.groupId) || text(process.env.PRTG_GROUP_ID),
      tag: text(stored.prtg?.tag) || text(process.env.PRTG_TAG),
    },
  };
}

export function getPublicSettings(): PublicSettings {
  const settings = getIntegrationSettings();
  return {
    graph: {
      tenantId: settings.graph.tenantId,
      clientId: settings.graph.clientId,
      clientSecretSet: settings.graph.clientSecretSet,
    },
    sharepoint: settings.sharepoint,
    prtg: {
      baseUrl: settings.prtg.baseUrl,
      username: settings.prtg.username,
      passwordSet: settings.prtg.passwordSet,
      groupId: settings.prtg.groupId,
      tag: settings.prtg.tag,
    },
  };
}

export type SettingsUpdate = {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  siteUrl: string;
  listName: string;
  newPassword: string;
  prtgBaseUrl: string;
  prtgUsername: string;
  prtgPassword: string;
  prtgGroupId: string;
  prtgTag: string;
};

function clean(value: string, label: string, max: number) {
  const trimmed = value.trim();
  if (trimmed.length > max) throw new Error(`${label} is te lang.`);
  return trimmed;
}

function cleanPrtgBaseUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.length > 200) throw new Error("PRTG-adres is te lang.");
  let parsed: URL;
  try {
    parsed = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
  } catch {
    throw new Error("PRTG-adres is geen geldig adres.");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("PRTG-adres moet http of https zijn.");
  }
  return parsed.origin;
}

function cleanPrtgToken(value: string, label: string, max: number) {
  const trimmed = value.trim();
  if (trimmed.length > max) throw new Error(`${label} is te lang.`);
  if (trimmed && !/^[\p{L}\p{N} ._'@:+#-]+$/u.test(trimmed)) {
    throw new Error(`${label} bevat een teken dat niet mag.`);
  }
  return trimmed;
}

export function updateSettings(update: SettingsUpdate): PublicSettings {
  const stored = readStored();
  const tenantId = clean(update.tenantId, "Tenant-id", 80);
  const clientId = clean(update.clientId, "Client-id", 80);
  const siteUrl = clean(update.siteUrl, "SharePoint-site", 200);
  const listName = clean(update.listName, "Lijstnaam", 80);
  if (!siteUrl || !listName) throw new Error("Site en lijstnaam zijn verplicht.");
  if (!/^[\p{L}\p{N} ._-]+$/u.test(listName)) throw new Error("Lijstnaam bevat een teken dat niet mag.");
  let parsed: URL;
  try {
    parsed = new URL(siteUrl);
  } catch {
    throw new Error("SharePoint-site is geen geldig adres.");
  }
  if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(".sharepoint.com")) {
    throw new Error("De site moet een https-adres op sharepoint.com zijn.");
  }

  const prtgBaseUrl = cleanPrtgBaseUrl(update.prtgBaseUrl);
  const prtgUsername = cleanPrtgToken(update.prtgUsername, "PRTG-gebruiker", 80);
  const prtgGroupId = cleanPrtgToken(update.prtgGroupId, "PRTG-groep", 40);
  const prtgTag = cleanPrtgToken(update.prtgTag, "PRTG-tag", 80);

  const next: StoredSettings = {
    ...stored,
    graph: {
      tenantId,
      clientId,
      clientSecret: update.clientSecret.trim() || text(stored.graph?.clientSecret) || text(process.env.GRAPH_CLIENT_SECRET),
    },
    sharepoint: {
      siteUrl,
      listName,
    },
    prtg: {
      baseUrl: prtgBaseUrl,
      username: prtgUsername || "Beheert",
      password: update.prtgPassword.trim() || text(stored.prtg?.password) || text(process.env.PRTG_PASSWORD),
      groupId: prtgGroupId,
      tag: prtgTag,
    },
  };
  if (update.newPassword.trim()) {
    if (update.newPassword.trim().length < 8) throw new Error("Het nieuwe wachtwoord moet minstens 8 tekens zijn.");
    next.adminPasswordHash = hashPassword(update.newPassword.trim());
  }
  writeStored(next);
  return getPublicSettings();
}

export function sharePointGraphPath(siteUrl: string) {
  const url = new URL(siteUrl);
  const pathname = url.pathname.replace(/\/$/, "") || "/";
  return `/sites/${url.hostname}:${pathname}`;
}
