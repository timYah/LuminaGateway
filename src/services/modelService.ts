import { asc, desc, eq } from "drizzle-orm";
import { getSqliteClient } from "../db";
import { providers } from "../db/schema";

export async function getActiveProvidersByModel(_slug: string) {
  void _slug;
  const db = getSqliteClient();
  const rows = await db
    .select()
    .from(providers)
    .where(eq(providers.isActive, true))
    .orderBy(desc(providers.priority), asc(providers.id));
  return rows;
}
