import { closePool } from "../db/pool.js";
import { exportDashboardsToJson } from "../db/exportJson.js";
import { logError } from "../log.js";
import { loadLocalEnv } from "../services/graphClient.js";

loadLocalEnv();

const outFlag = process.argv.indexOf("--out");
const outFile = outFlag >= 0 ? process.argv[outFlag + 1] : undefined;

try {
  const result = await exportDashboardsToJson(outFile);
  process.stdout.write(`${JSON.stringify({ count: result.count, file: result.file })}\n`);
} catch {
  logError("export mislukt");
  process.exitCode = 1;
} finally {
  await closePool();
}
