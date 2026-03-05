import { getDb } from "../db";
import { providers } from "../db/schema";

export async function getAllProviders() {
  const db = getDb();
  return await db.select().from(providers);
}
