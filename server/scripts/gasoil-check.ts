/**
 * Eén gasoliecontrole, dezelfde service als de ochtendtaak en de API.
 * Schrijft alleen NL/BE-status. Geen credentials.
 */
import { runGasOilCheck } from "../gasoil/check.js";

const report = await runGasOilCheck();
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (report.status !== "success") process.exitCode = 1;
