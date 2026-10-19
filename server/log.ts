import { readAppVersion } from "./appPaths.js";

export type LogFields = {
  event?: string;
  requestId?: string;
  screenId?: string;
  dashboardId?: string;
  durationMs?: number;
  [key: string]: unknown;
};

const SERVICE = "tzg-dashboard";

function stamp() {
  return new Date().toISOString();
}

export function sanitize(message: string) {
  return message
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/client[_-]?secret["'\s:=]+[^\s"',}]+/gi, "client_secret=[redacted]")
    .replace(/passhash["'\s:=]+[^\s"',}]+/gi, "passhash=[redacted]")
    .replace(/password["'\s:=]+[^\s"',}]+/gi, "password=[redacted]")
    .replace(/GRAPH_CLIENT_SECRET=\S+/gi, "GRAPH_CLIENT_SECRET=[redacted]")
    .replace(/PRTG_PASSWORD=\S+/gi, "PRTG_PASSWORD=[redacted]")
    .replace(/PRTG_PASSHASH=\S+/gi, "PRTG_PASSHASH=[redacted]")
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "postgresql://[redacted]")
    .replace(/DATABASE_URL=\S+/gi, "DATABASE_URL=[redacted]")
    .replace(/tzg_[A-Za-z0-9_-]{8,}/g, "tzg_[redacted]")
    .replace(/cookie["'\s:=]+[^\s"',}]+/gi, "cookie=[redacted]");
}

function levelAllowed(level: string) {
  const configured = (process.env.LOG_LEVEL || "info").toLowerCase();
  const order = ["debug", "info", "warn", "error"];
  const want = order.indexOf(configured);
  const have = order.indexOf(level);
  if (want < 0) return true;
  return have >= want;
}

function emit(level: "info" | "warn" | "error" | "debug", message: string, fields: LogFields = {}) {
  if (!levelAllowed(level)) return;
  const production = process.env.NODE_ENV === "production";
  const cleanMessage = sanitize(message);
  const payload: Record<string, unknown> = {
    timestamp: stamp(),
    level,
    message: cleanMessage,
    service: SERVICE,
    version: process.env.APP_VERSION?.trim() || readAppVersion(),
  };
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null || value === "") continue;
    payload[key] = typeof value === "string" ? sanitize(value) : value;
  }
  const line = production ? JSON.stringify(payload) : `[teunesen-tv] ${payload.timestamp} ${level} ${cleanMessage}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
  if (level === "error" || level === "warn") remember(payload);
}

export function logInfo(message: string, fields?: LogFields) {
  emit("info", message, fields);
}

export function logWarn(message: string, fields?: LogFields) {
  emit("warn", message, fields);
}

export function logError(message: string, fields?: LogFields) {
  emit("error", message, fields);
}

export function logDebug(message: string, fields?: LogFields) {
  emit("debug", message, fields);
}

type SafeEvent = {
  timestamp: string;
  level: string;
  message: string;
  event?: string;
  requestId?: string;
};

const recent: SafeEvent[] = [];

function remember(payload: Record<string, unknown>) {
  recent.push({
    timestamp: String(payload.timestamp),
    level: String(payload.level),
    message: String(payload.message).slice(0, 240),
    event: typeof payload.event === "string" ? payload.event : undefined,
    requestId: typeof payload.requestId === "string" ? payload.requestId : undefined,
  });
  if (recent.length > 50) recent.shift();
}

export function recentSafeEvents() {
  return [...recent].reverse();
}

export function resetSafeEvents() {
  recent.length = 0;
}
