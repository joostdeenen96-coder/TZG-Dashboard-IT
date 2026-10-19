import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function detectAppRoot() {
  const fromEnv = process.env.APP_ROOT?.trim();
  if (fromEnv) return path.resolve(fromEnv);

  const here = path.dirname(fileURLToPath(import.meta.url));
  // Productie: dist/server/appPaths.js → drie niveaus omhoog naar de app-root.
  // Development (tsx): server/appPaths.ts → één niveau omhoog.
  if (here.includes(`${path.sep}dist${path.sep}server`)) {
    return path.resolve(here, "../..");
  }
  return path.resolve(here, "..");
}

let cachedRoot: string | null = null;

export function appRoot() {
  if (!cachedRoot) cachedRoot = detectAppRoot();
  return cachedRoot;
}

export function dataDir() {
  const fromEnv = process.env.DATA_DIR?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  return path.join(appRoot(), "data");
}

/** Schrijf/lees bij voorkeur onder data/ (Docker-volume); val terug op root-config.json. */
export function configFilePath() {
  const inData = path.join(dataDir(), "config.json");
  const inRoot = path.join(appRoot(), "config.json");
  if (existsSync(inData)) return inData;
  if (existsSync(inRoot)) return inRoot;
  return inData;
}

export function clientDistDir() {
  return path.join(appRoot(), "dist", "client");
}

export function packageJsonPath() {
  return path.join(appRoot(), "package.json");
}

export function readAppVersion() {
  try {
    const raw: unknown = JSON.parse(readFileSync(packageJsonPath(), "utf8"));
    if (!raw || typeof raw !== "object") return "0.0.0";
    const version = (raw as { version?: unknown }).version;
    return typeof version === "string" && version.trim() ? version.trim() : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export function isCompiledServer() {
  const entry = process.argv[1] ?? "";
  return entry.includes(`${path.sep}dist${path.sep}server`);
}

export function resolveListenPort() {
  const raw = process.env.PORT?.trim();
  if (raw) {
    const port = Number(raw);
    if (Number.isInteger(port) && port > 0 && port < 65536) return port;
  }
  if (process.env.NODE_ENV === "production" || isCompiledServer()) return 8080;
  return 43124;
}
