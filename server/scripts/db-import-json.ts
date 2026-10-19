import { closePool } from "../db/pool.js";
import { importDashboardsFromJson } from "../db/importJson.js";
import { logError } from "../log.js";
import { loadLocalEnv } from "../services/graphClient.js";

loadLocalEnv();

const dryRun = process.argv.includes("--dry-run");
const force = process.argv.includes("--force");

try {
  const report = await importDashboardsFromJson({ dryRun, force });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} catch (error) {
  logError(`import mislukt ${error instanceof Error ? error.name : ""}`.trim());
  process.exitCode = 1;
} finally {
  await closePool();
}
