import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { dataDir } from "../appPaths.js";
import { PostgresDashboardRepository } from "../dashboards/postgresRepository.js";
import { logInfo } from "../log.js";

export async function exportDashboardsToJson(outFile?: string) {
  const dashboards = await new PostgresDashboardRepository().getAll();
  const target = outFile ?? path.join(dataDir(), "dashboards.export.json");
  mkdirSync(path.dirname(target), { recursive: true });
  const body = { version: 1 as const, dashboards };
  writeFileSync(target, `${JSON.stringify(body, null, 2)}\n`, { mode: 0o600 });
  logInfo(`export dashboards aantal=${dashboards.length}`);
  return { file: target, count: dashboards.length };
}
