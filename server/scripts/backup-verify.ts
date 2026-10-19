import { loadLocalEnv } from "../services/graphClient.js";
import { verifyBackup } from "../backup/backup.js";
import { logError } from "../log.js";

loadLocalEnv();

try {
  const result = await verifyBackup(process.argv[2]);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch {
  logError("backup verify mislukt", { event: "backup.verify" });
  process.exitCode = 1;
}
