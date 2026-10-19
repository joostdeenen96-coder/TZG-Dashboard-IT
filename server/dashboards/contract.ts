import type { DashboardDefinition } from "./model.js";

export type RepositoryContext = {
  actor?: string;
};

export interface DashboardRepository {
  getAll(): Promise<DashboardDefinition[]>;
  getById(id: string): Promise<DashboardDefinition | null>;
  getBySlug(slug: string): Promise<DashboardDefinition | null>;
  create(input: unknown, context?: RepositoryContext): Promise<DashboardDefinition>;
  update(id: string, input: unknown, context?: RepositoryContext): Promise<DashboardDefinition>;
  delete(id: string, context?: RepositoryContext): Promise<boolean>;
  health(): Promise<{ ok: boolean; detail: string }>;
}
