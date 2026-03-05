import { and, asc, desc, eq, gt } from "drizzle-orm";
import { getDb, type SqliteDatabase } from "../db";
import { models, providers } from "../db/schema";

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
        eq(providers.isActive, true),
        gt(providers.balance, 0)
      )
    )
    .orderBy(desc(providers.balance), asc(providers.priority));
  return rows.map((row) => row.provider);
}
