import { eq } from "drizzle-orm";
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
