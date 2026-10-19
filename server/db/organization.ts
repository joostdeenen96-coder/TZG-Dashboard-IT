import { getPool } from "./pool.js";

export const DEFAULT_ORG_SLUG = "teunesen";
export const DEFAULT_ORG_ID = "11111111-1111-4111-8111-111111111111";

let cached: string | null = null;

export function clearOrganizationCache() {
  cached = null;
}

export async function defaultOrganizationId() {
  if (cached) return cached;
  const result = await getPool().query<{ id: string }>(
    "SELECT id FROM organizations WHERE slug = $1",
    [DEFAULT_ORG_SLUG],
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error("Standaardorganisatie ontbreekt. Voer migratie of db:seed uit.");
  cached = id;
  return id;
}
