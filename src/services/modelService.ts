import { asc, eq } from "drizzle-orm";
import { getSqliteClient } from "../db";
import { providers } from "../db/schema";

export async function getActiveProvidersByModel(_slug: string) {
  const db = getSqliteClient();
  const rows = await db
    .select()
    .from(providers)
    .where(eq(providers.isActive, true))
    .orderBy(asc(providers.priority), asc(providers.id));
  return rows;
}
