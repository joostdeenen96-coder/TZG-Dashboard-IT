import { loadLocalEnv } from "../services/graphClient.js";
import { dropRestoreDatabase, listBackups, restoreToDatabase, verifyBackup } from "../backup/backup.js";
import { logError, logInfo } from "../log.js";

loadLocalEnv();

const productionDb = process.env.POSTGRES_DB?.trim() || "tzg";
const target = process.env.RESTORE_TEST_DB?.trim() || "tzg_restore_test";
if (target === productionDb) {
  logError("restore-test weigert productiedatabase", { event: "backup.restore-test" });
  process.exit(1);
}

try {
  const file = process.argv[2] || listBackups()[0]?.file;
  if (!file) throw new Error("Geen backup gevonden.");
  await verifyBackup(file);
  const restored = await restoreToDatabase(file, target);
  logInfo("restore-test klaar", { event: "backup.restore-test" });
  process.stdout.write(`${JSON.stringify({ ok: true, ...restored, productionDb }, null, 2)}\n`);
  await dropRestoreDatabase(target);
} catch {
  logError("restore-test mislukt", { event: "backup.restore-test" });
  await dropRestoreDatabase(target).catch(() => undefined);
  process.exitCode = 1;
}
