import { copyFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { dataDir } from "../appPaths.js";
import { parseDashboardStore } from "../dashboards/model.js";
import { PostgresDashboardRepository } from "../dashboards/postgresRepository.js";
import { logInfo } from "../log.js";

export type ImportReport = {
  dryRun: boolean;
  force: boolean;
  source: string;
  backup: string | null;
  inserted: string[];
  updated: string[];
  skipped: string[];
};

export async function importDashboardsFromJson(options: { dryRun: boolean; force: boolean }): Promise<ImportReport> {
  const source = path.join(dataDir(), "dashboards.json");
  if (!existsSync(source)) {
    throw new Error("dashboards.json ontbreekt. Niets geïmporteerd.");
  }
  const report: ImportReport = {
    dryRun: options.dryRun,
    force: options.force,
    source,
    backup: null,
    inserted: [],
    updated: [],
    skipped: [],
  };
  if (!options.dryRun) {
    const backup = `${source}.bak-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    copyFileSync(source, backup);
    report.backup = backup;
    logInfo("import backup geschreven");
  }
  const store = parseDashboardStore(JSON.parse(readFileSync(source, "utf8")));
  const postgres = new PostgresDashboardRepository();
  for (const dashboard of store.dashboards) {
    const existing = await postgres.getBySlug(dashboard.slug);
    if (existing && !options.force) {
      report.skipped.push(dashboard.slug);
      continue;
    }
    const payload = {
      name: dashboard.name,
      slug: dashboard.slug,
      description: dashboard.description,
      enabled: dashboard.enabled,
      theme: dashboard.theme,
      layout: dashboard.layout,
      widgets: dashboard.widgets,
    };
    if (options.dryRun) {
      if (existing) report.updated.push(dashboard.slug);
      else report.inserted.push(dashboard.slug);
      continue;
    }
    if (existing) {
      await postgres.update(existing.id, payload, { actor: "import" });
      report.updated.push(dashboard.slug);
    } else {
      await postgres.create(payload, { actor: "import" });
      report.inserted.push(dashboard.slug);
    }
  }
  logInfo(
    `import json dryRun=${options.dryRun} inserted=${report.inserted.length} updated=${report.updated.length} skipped=${report.skipped.length}`,
  );
  return report;
}
