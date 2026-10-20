import { closePool } from "../db/pool.js";
import { bootstrapPostgresRepository } from "../db/bootstrap.js";
import { logError, logInfo } from "../log.js";
import { loadLocalEnv } from "../services/graphClient.js";

loadLocalEnv();

try {
  const report = await bootstrapPostgresRepository();
  logInfo(
    `seed klaar org=${report.organization} aangemaakt=${report.created.join(",") || "geen"} overgeslagen=${report.skipped.join(",") || "geen"}`,
    { event: "seed.done" },
  );
  process.stdout.write(`${JSON.stringify({ ok: true, ...report }, null, 2)}\n`);
} catch {
  logError("seed mislukt", { event: "seed.failed" });
  process.stdout.write(`${JSON.stringify({ ok: false, error: "seed mislukt" }, null, 2)}\n`);
  process.exitCode = 1;
} finally {
  await closePool();
}
