const PLACEHOLDERS = new Set([
  "",
  "change-me",
  "changeme",
  "change_me",
  "password",
  "secret",
  "replace-me",
  "replaceme",
  "todo",
  "example",
  "dummy",
  "<password>",
  "your-password-here",
]);

export type LogLevel = "debug" | "info" | "warn" | "error";

export type AppConfig = {
  nodeEnv: string;
  production: boolean;
  port: number;
  databaseUrl: string;
  postgresDb: string;
  postgresUser: string;
  postgresPasswordSet: boolean;
  dashboardRepository: "json" | "postgres";
  heartbeatSeconds: number;
  offlineAfterSeconds: number;
  backupEnabled: boolean;
  backupSchedule: string;
  backupRetentionDays: number;
  backupDirectory: string;
  backupMaxAgeHours: number;
  logLevel: LogLevel;
  graphEnabled: boolean;
  trustProxy: number;
  appVersion: string;
  buildCommit: string;
  buildDate: string;
};

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

function read(env: NodeJS.Dict<string>, name: string) {
  return env[name]?.trim() ?? "";
}

function isPlaceholder(value: string) {
  return PLACEHOLDERS.has(value.trim().toLowerCase());
}

function requireValue(env: NodeJS.Dict<string>, name: string, production: boolean) {
  const value = read(env, name);
  if (!value) throw new ConfigError(`Verplichte configuratie ontbreekt: ${name}.`);
  if (production && isPlaceholder(value)) {
    throw new ConfigError(`Placeholder is niet geldig in productie: ${name}.`);
  }
  return value;
}

function parseIntEnv(env: NodeJS.Dict<string>, name: string, fallback: number | null, min: number, max: number, required: boolean) {
  const raw = read(env, name);
  if (!raw) {
    if (required) throw new ConfigError(`Verplichte configuratie ontbreekt: ${name}.`);
    if (fallback === null) throw new ConfigError(`Verplichte configuratie ontbreekt: ${name}.`);
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isInteger(value)) throw new ConfigError(`Ongeldige waarde voor ${name}.`);
  if (value < min || value > max) throw new ConfigError(`Ongeldige waarde voor ${name}.`);
  return value;
}

function parseLogLevel(raw: string, required: boolean): LogLevel {
  if (!raw) {
    if (required) throw new ConfigError("Verplichte configuratie ontbreekt: LOG_LEVEL.");
    return "info";
  }
  const value = raw.toLowerCase();
  if (value === "debug" || value === "info" || value === "warn" || value === "error") return value;
  throw new ConfigError("Ongeldige waarde voor LOG_LEVEL.");
}

function parseCron(value: string) {
  const parts = value.trim().split(/\s+/);
  if (parts.length !== 5) throw new ConfigError("Ongeldige waarde voor BACKUP_SCHEDULE.");
  if (parts.some((part) => !/^(\*|\d+|\*\/\d+|\d+-\d+)(,(\*|\d+|\*\/\d+|\d+-\d+))*$/.test(part))) {
    throw new ConfigError("Ongeldige waarde voor BACKUP_SCHEDULE.");
  }
  return value.trim();
}

function graphRequested(env: NodeJS.Dict<string>) {
  const flag = read(env, "GRAPH_ENABLED").toLowerCase();
  if (flag === "false" || flag === "0") return false;
  if (flag === "true" || flag === "1") return true;
  return Boolean(read(env, "GRAPH_TENANT_ID") || read(env, "GRAPH_CLIENT_ID") || read(env, "GRAPH_CLIENT_SECRET"));
}

function repositoryMode(env: NodeJS.Dict<string>, production: boolean): "json" | "postgres" {
  const explicit = read(env, "DASHBOARD_REPOSITORY").toLowerCase();
  if (explicit === "json") {
    if (production) throw new ConfigError("Productie mag JSON niet als stille primaire opslag gebruiken.");
    return "json";
  }
  if (explicit === "postgres") return "postgres";
  return production || read(env, "DATABASE_URL") ? "postgres" : "json";
}

export function loadConfig(env: NodeJS.Dict<string> = process.env): AppConfig {
  const nodeEnv = read(env, "NODE_ENV") || "development";
  const production = nodeEnv === "production";
  if (production && !read(env, "NODE_ENV")) {
    throw new ConfigError("Verplichte configuratie ontbreekt: NODE_ENV.");
  }

  const port = parseIntEnv(env, "PORT", production ? null : 43124, 1, 65535, production);
  const postgresDb = production ? requireValue(env, "POSTGRES_DB", true) : read(env, "POSTGRES_DB") || "tzg";
  const postgresUser = production ? requireValue(env, "POSTGRES_USER", true) : read(env, "POSTGRES_USER") || "tzg";
  const postgresPassword = read(env, "POSTGRES_PASSWORD");
  if (production) {
    requireValue(env, "POSTGRES_PASSWORD", true);
    requireValue(env, "DATABASE_URL", true);
  }
  const databaseUrl = read(env, "DATABASE_URL");
  if (production && isPlaceholder(databaseUrl)) {
    throw new ConfigError("Placeholder is niet geldig in productie: DATABASE_URL.");
  }
  if (databaseUrl && /postgresql:\/\/[^:@]+:(change-me|changeme|password|secret)@/i.test(databaseUrl)) {
    if (production) throw new ConfigError("Placeholder is niet geldig in productie: DATABASE_URL.");
  }

  const heartbeatSeconds = parseIntEnv(env, "SCREEN_HEARTBEAT_SECONDS", production ? null : 60, 5, 3600, production);
  const offlineAfterSeconds = parseIntEnv(
    env,
    "SCREEN_OFFLINE_AFTER_SECONDS",
    production ? null : 180,
    10,
    86_400,
    production,
  );
  if (offlineAfterSeconds < heartbeatSeconds) {
    throw new ConfigError("SCREEN_OFFLINE_AFTER_SECONDS moet groter zijn dan SCREEN_HEARTBEAT_SECONDS.");
  }

  const backupRetentionDays = parseIntEnv(env, "BACKUP_RETENTION_DAYS", production ? null : 14, 1, 365, production);
  const backupScheduleRaw = read(env, "BACKUP_SCHEDULE");
  const backupSchedule = production
    ? parseCron(requireValue(env, "BACKUP_SCHEDULE", true))
    : backupScheduleRaw
      ? parseCron(backupScheduleRaw)
      : "0 2 * * *";
  const logLevel = parseLogLevel(read(env, "LOG_LEVEL"), production);

  const enabledGraph = graphRequested(env);
  if (enabledGraph) {
    requireValue(env, "GRAPH_TENANT_ID", production);
    requireValue(env, "GRAPH_CLIENT_ID", production);
    requireValue(env, "GRAPH_CLIENT_SECRET", production);
  }

  const trustProxyRaw = read(env, "TRUST_PROXY");
  const trustProxy = trustProxyRaw ? parseIntEnv(env, "TRUST_PROXY", 0, 0, 10, false) : 0;

  return {
    nodeEnv,
    production,
    port,
    databaseUrl,
    postgresDb,
    postgresUser,
    postgresPasswordSet: Boolean(postgresPassword) && !isPlaceholder(postgresPassword),
    dashboardRepository: repositoryMode(env, production),
    heartbeatSeconds,
    offlineAfterSeconds,
    backupEnabled: read(env, "BACKUP_ENABLED").toLowerCase() !== "false",
    backupSchedule,
    backupRetentionDays,
    backupDirectory: read(env, "BACKUP_DIRECTORY") || "/backups",
    backupMaxAgeHours: parseIntEnv(env, "BACKUP_MAX_AGE_HOURS", 36, 1, 24 * 30, false),
    logLevel,
    graphEnabled: enabledGraph,
    trustProxy,
    appVersion: read(env, "APP_VERSION") || "0.4.1",
    buildCommit: read(env, "BUILD_COMMIT") || "unknown",
    buildDate: read(env, "BUILD_DATE") || "",
  };
}

let cached: AppConfig | null = null;

export function appConfig() {
  if (!cached) cached = loadConfig();
  return cached;
}

export function resetAppConfig() {
  cached = null;
}

export function assertProductionConfig(env: NodeJS.Dict<string> = process.env) {
  return loadConfig(env);
}
