export type RepositoryMode = "postgres" | "json";

export function resolveRepositoryMode(): RepositoryMode {
  const explicit = process.env.DASHBOARD_REPOSITORY?.trim().toLowerCase();
  if (explicit === "json") return "json";
  if (explicit === "postgres") return "postgres";
  if (process.env.DATABASE_URL?.trim()) return "postgres";
  if (process.env.NODE_ENV === "production") return "postgres";
  return "json";
}
