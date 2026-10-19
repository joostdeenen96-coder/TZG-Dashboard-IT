import { closePool } from "../db/pool.js";
import { migrationStatus } from "../db/migrate.js";
import { logError, logInfo } from "../log.js";
import { loadLocalEnv } from "../services/graphClient.js";

loadLocalEnv();

try {
  const status = await migrationStatus();
  logInfo(`migratiestatus applied=${status.applied.length} pending=${status.pending.length}`);
  process.stdout.write(`${JSON.stringify(status)}\n`);
} catch {
  logError("migratiestatus mislukt");
  process.exitCode = 1;
} finally {
  await closePool();
}
