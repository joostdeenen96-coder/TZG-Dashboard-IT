import { loadLocalEnv } from "../services/graphClient.js";
import { logError } from "../log.js";
import { runMigrateCli } from "../db/migrate.js";

loadLocalEnv();

runMigrateCli().catch(() => {
  logError("migratie mislukt");
  process.exit(1);
});
