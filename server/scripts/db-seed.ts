import { closePool, getPool } from "../db/pool.js";
import { DEFAULT_ORG_ID, DEFAULT_ORG_SLUG, clearOrganizationCache } from "../db/organization.js";
import { logError, logInfo } from "../log.js";
import { loadLocalEnv } from "../services/graphClient.js";

loadLocalEnv();

try {
  await getPool().query(
    `INSERT INTO organizations (id, name, slug)
     VALUES ($1, 'Teunesen', $2)
     ON CONFLICT (slug) DO NOTHING`,
    [DEFAULT_ORG_ID, DEFAULT_ORG_SLUG],
  );
  clearOrganizationCache();
  logInfo("seed organisatie teunesen");
} catch {
  logError("seed mislukt");
  process.exitCode = 1;
} finally {
  await closePool();
}
