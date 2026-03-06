import { and, asc, eq } from "drizzle-orm";
import { getDb, type SqliteDatabase } from "../db";
import { type NewModel, models, providers } from "../db/schema";

function getClient() {
  return getDb() as SqliteDatabase;
}

export async function getModelsBySlug(slug: string) {
  const db = getClient();
  return await db
    .select()
    .from(models)
    .innerJoin(providers, eq(models.providerId, providers.id))
    .where(eq(models.slug, slug));
}

export async function getActiveProvidersByModel(slug: string) {
  const db = getClient();
  const rows = await db
    .select({ provider: providers })
    .from(models)
    .innerJoin(providers, eq(models.providerId, providers.id))
    .where(
      and(
        eq(models.slug, slug),
        eq(providers.isActive, true)
      )
    )
    .orderBy(asc(providers.priority), asc(providers.id));
  return rows.map((row) => row.provider);
}

export async function getModelByProviderAndSlug(
  providerId: number,
  slug: string
) {
  const db = getClient();
  const rows = await db
    .select()
    .from(models)
    .where(and(eq(models.providerId, providerId), eq(models.slug, slug)));
  return rows[0] ?? null;
}

export type ModelMappingFilters = {
  providerId?: number;
  slug?: string;
};

export async function getAllModelMappings(filters: ModelMappingFilters = {}) {
  const db = getClient();
  const conditions = [];

  if (filters.providerId) {
    conditions.push(eq(models.providerId, filters.providerId));
  }
  if (filters.slug) {
    conditions.push(eq(models.slug, filters.slug));
  }

  const baseQuery = db
    .select({
      id: models.id,
      providerId: models.providerId,
      providerName: providers.name,
      slug: models.slug,
      upstreamName: models.upstreamName,
      inputPrice: models.inputPrice,
      outputPrice: models.outputPrice,
    })
    .from(models)
    .innerJoin(providers, eq(models.providerId, providers.id));

  if (conditions.length > 0) {
    return await baseQuery
      .where(and(...conditions))
      .orderBy(asc(models.slug), asc(providers.name));
  }

  return await baseQuery.orderBy(asc(models.slug), asc(providers.name));
}

export async function createModelMapping(data: NewModel) {
  const db = getClient();
  const rows = await db.insert(models).values(data).returning();
  return rows[0] ?? null;
}

export async function updateModelMapping(
  id: number,
  data: Partial<NewModel>
) {
  const db = getClient();
  const rows = await db.update(models).set(data).where(eq(models.id, id)).returning();
  return rows[0] ?? null;
}
