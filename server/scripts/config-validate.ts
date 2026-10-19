import { loadLocalEnv } from "../services/graphClient.js";
import { ConfigError, loadConfig } from "../config.js";
import { logError, logInfo } from "../log.js";

loadLocalEnv();

try {
  const config = loadConfig();
  logInfo(`configuratie geldig env=${config.nodeEnv} port=${config.port}`, { event: "config.validate" });
  process.stdout.write(`${JSON.stringify({ ok: true, environment: config.nodeEnv, port: config.port, graphEnabled: config.graphEnabled }, null, 2)}\n`);
} catch (error) {
  const message = error instanceof ConfigError ? error.message : "Configuratie ongeldig.";
  logError(message, { event: "config.validate" });
  process.stdout.write(`${JSON.stringify({ ok: false, error: message }, null, 2)}\n`);
  process.exitCode = 1;
}
