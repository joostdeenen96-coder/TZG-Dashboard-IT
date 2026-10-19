import { loadLocalEnv } from "../services/graphClient.js";
import { createBackup } from "../backup/backup.js";
import { logError } from "../log.js";

loadLocalEnv();

try {
  const meta = await createBackup();
  process.stdout.write(`${JSON.stringify(meta, null, 2)}\n`);
} catch (error) {
  logError("backup create mislukt", { event: "backup.create" });
  process.exitCode = 1;
}
