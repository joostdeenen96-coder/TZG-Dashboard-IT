import { loadLocalEnv } from "../services/graphClient.js";
import { cleanupBackups } from "../backup/backup.js";

loadLocalEnv();
process.stdout.write(`${JSON.stringify(cleanupBackups(), null, 2)}\n`);
