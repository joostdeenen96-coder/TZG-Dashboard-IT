import { DashboardValidationError } from "../dashboards/model.js";
import { PostgresDashboardRepository } from "../dashboards/postgresRepository.js";
import { createDefaultDashboards } from "../dashboards/seed.js";
import { logError, logInfo } from "../log.js";
import { DEFAULT_ORG_ID, DEFAULT_ORG_SLUG, clearOrganizationCache } from "./organization.js";
import { getPool } from "./pool.js";

export type SeedReport = {
  organization: "created" | "existing";
  created: string[];
  skipped: string[];
};

export async function ensureDefaultOrganization() {
  const inserted = await getPool().query<{ id: string }>(
    `INSERT INTO organizations (id, name, slug)
     VALUES ($1, 'Teunesen', $2)
     ON CONFLICT (slug) DO NOTHING
     RETURNING id`,
    [DEFAULT_ORG_ID, DEFAULT_ORG_SLUG],
  );
  clearOrganizationCache();
  if (inserted.rowCount && inserted.rowCount > 0) {
    logInfo("seed organisatie teunesen aangemaakt", { event: "seed.organization" });
    return "created" as const;
  }
  logInfo("seed organisatie teunesen aanwezig", { event: "seed.organization" });
  return "existing" as const;
}

export async function seedDefaultDashboards(repository = new PostgresDashboardRepository()): Promise<SeedReport> {
  const organization = await ensureDefaultOrganization();
  const created: string[] = [];
  const skipped: string[] = [];
  for (const dashboard of createDefaultDashboards()) {
    const existing = await repository.getBySlug(dashboard.slug);
    if (existing) {
      skipped.push(dashboard.slug);
      logInfo(`seed dashboard overgeslagen ${dashboard.slug}`, { event: "seed.skip" });
      continue;
    }
    try {
      await repository.create(
        {
          name: dashboard.name,
          slug: dashboard.slug,
          description: dashboard.description,
          enabled: dashboard.enabled,
          theme: dashboard.theme,
          layout: dashboard.layout,
          widgets: dashboard.widgets,
        },
        { actor: "system" },
      );
      created.push(dashboard.slug);
      logInfo(`seed dashboard aangemaakt ${dashboard.slug}`, { event: "seed.create" });
    } catch (error) {
      if (error instanceof DashboardValidationError && /Slug bestaat al/i.test(error.message)) {
        skipped.push(dashboard.slug);
        logInfo(`seed dashboard overgeslagen ${dashboard.slug}`, { event: "seed.skip" });
        continue;
      }
      throw error;
    }
  }
  return { organization, created, skipped };
}

export async function validateSeededRepository(repository = new PostgresDashboardRepository()) {
  const health = await repository.health();
  if (!health.ok) {
    logError("seed repository niet klaar", { event: "seed.validate" });
    throw new Error("Dashboardrepository is niet klaar na seed.");
  }
  logInfo(`seed repository ok ${health.detail ?? ""}`.trim(), { event: "seed.validate" });
  return health;
}

export async function bootstrapPostgresRepository() {
  const report = await seedDefaultDashboards();
  await validateSeededRepository();
  return report;
}
