import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { providers } from "../db/schema";

export async function getAllProviders() {
  const db = getDb();
  return await db.select().from(providers);
}

export async function getProviderById(id: number) {
  const db = getDb();
  const rows = await db.select().from(providers).where(eq(providers.id, id));
  return rows[0] ?? null;
}
