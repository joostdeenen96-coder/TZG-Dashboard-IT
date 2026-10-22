/**
 * Production-safe diagnostiek. Geen tokens, wachtwoorden of ruwe telefoonnummers.
 *
 *   node dist/server/shipPlanning/testQuery.js
 */
import { shipPlanningCredentialsConfigured } from "./client.js";
import { amsterdamYmd } from "./dates.js";
import { describeFields, operationalPresence } from "./fieldReport.js";
import { SHIP_PLANNING_ENTITY_TYPE_ID, SHIP_PLANNING_QUERY_PATH } from "./pluginQuery.js";
import { ShipPlanningQueryError, TeunesenShipPlanningProvider } from "./teunesenShipPlanningProvider.js";

const DIAGNOSTIC_PAGE_SIZE = 8;

function line(text = "") {
  console.log(text);
}

async function main() {
  line("Schepenplanning test-query");
  line(`entityTypeId: ${SHIP_PLANNING_ENTITY_TYPE_ID}`);
  line(`query: POST ${SHIP_PLANNING_QUERY_PATH}`);
  line(`credentials: ${shipPlanningCredentialsConfigured() ? "configured" : "not-configured"}`);
  line(`date (tomorrow, Europe/Amsterdam): ${amsterdamYmd(new Date(), 1)}`);
  line(`pageSize: ${DIAGNOSTIC_PAGE_SIZE}`);
  line("");

  if (!shipPlanningCredentialsConfigured()) {
    line("status: unavailable");
    line("error: credentials not configured");
    process.exitCode = 2;
    return;
  }

  const provider = new TeunesenShipPlanningProvider();
  try {
    const auth = await provider.authenticate();
    line(`authenticate: HTTP ${auth.status}`);
    line(`totpRequired: ${auth.totpRequired}`);
  } catch (error) {
    const status = error instanceof ShipPlanningQueryError ? error.status : 0;
    line("authenticate: FAIL");
    line(`status: unavailable`);
    line(`error: authenticatie mislukt (HTTP ${status})`);
    process.exitCode = 1;
    return;
  }

  try {
    const day = await provider.queryDate(amsterdamYmd(new Date(), 1), DIAGNOSTIC_PAGE_SIZE, false);
    const sample = day.entities.slice(0, DIAGNOSTIC_PAGE_SIZE);
    const fields = describeFields(sample);
    const operational = operationalPresence(sample);
    line(`queryStatus: 200`);
    line(`recordCount: ${sample.length}`);
    line(`totalCount: ${day.totalCount == null ? "unknown" : String(day.totalCount)}`);
    line("");
    line("velden:");
    if (!fields.length) line("- (geen velden)");
    for (const field of fields) {
      const nullable = field.nulls > 0 ? "nullable" : field.nonNull > 0 ? "no-nulls-in-sample" : "unknown";
      line(`- ${field.path}: ${field.types.join("|")} present=${field.present} nulls=${field.nulls} ${nullable}`);
    }
    line("");
    line("operationele velden:");
    for (const [target, info] of Object.entries(operational)) {
      line(`- ${target}: bron=${info.source} aanwezig=${info.present ? "ja" : "nee"} nonNull=${info.nonNull}`);
    }
    line("");
    if (day.recordCount < 1) {
      line("status: geen bruikbare records");
      line("STOP: entityTypeId 255 leverde via de plugin-query geen records.");
      process.exitCode = 1;
      return;
    }
    line("status: records");
  } catch (error) {
    const status = error instanceof ShipPlanningQueryError ? error.status : 0;
    const message = error instanceof Error ? error.message : "query mislukt";
    line(`queryStatus: ${status || "error"}`);
    line(`recordCount: 0`);
    line(`status: unavailable`);
    line(`error: ${message.replace(/Bearer\s+\S+/gi, "Bearer [redacted]")}`);
    line("STOP: entityTypeId 255 leverde via de plugin-query geen bruikbare records.");
    process.exitCode = 1;
  }
}

const isDirect = process.argv[1]?.includes("testQuery");
if (isDirect) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : "onbekend";
    console.log(`status: unavailable`);
    console.log(`error: ${message.replace(/Bearer\s+\S+/gi, "Bearer [redacted]")}`);
    process.exitCode = 1;
  });
}
