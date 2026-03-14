import { and, asc, desc, eq } from "drizzle-orm";
import { getSqliteClient } from "../db";
import { modelPriorities, providers, type Provider } from "../db/schema";

export type ActiveProvider = Provider & { modelPriority?: number | null };

export async function getActiveProvidersByModel(modelSlug: string): Promise<ActiveProvider[]> {
  const db = getSqliteClient();
  const rows = await db
    .select({ provider: providers, modelPriority: modelPriorities.priority })
    .from(providers)
    .leftJoin(
      modelPriorities,
      and(eq(modelPriorities.providerId, providers.id), eq(modelPriorities.modelSlug, modelSlug))
    )
    .where(eq(providers.isActive, true))
    .orderBy(desc(providers.priority), asc(providers.id));
  return rows.map((row) => ({
    ...row.provider,
    modelPriority: row.modelPriority ?? null,
  }));
}
