import { loadLocalEnv } from "../services/graphClient.js";
import { listBackups } from "../backup/backup.js";

loadLocalEnv();
process.stdout.write(`${JSON.stringify({ backups: listBackups() }, null, 2)}\n`);
