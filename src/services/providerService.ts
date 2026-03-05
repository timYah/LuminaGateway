import { eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { type NewProvider, providers } from "../db/schema";

export async function getAllProviders() {
  const db = getDb();
  return await db.select().from(providers);
}

export async function getProviderById(id: number) {
  const db = getDb();
  const rows = await db.select().from(providers).where(eq(providers.id, id));
  return rows[0] ?? null;
}

export async function createProvider(data: NewProvider) {
  const db = getDb();
  const rows = await db.insert(providers).values(data).returning();
  return rows[0] ?? null;
}

export type ProviderUpdate = Partial<NewProvider>;

export async function updateProvider(id: number, data: ProviderUpdate) {
  const db = getDb();
  const rows = await db
    .update(providers)
    .set({ ...data, updatedAt: sql`(unixepoch())` })
    .where(eq(providers.id, id))
    .returning();
  return rows[0] ?? null;
}

export async function deactivateProvider(id: number) {
  const db = getDb();
  const rows = await db
    .update(providers)
    .set({ isActive: false, updatedAt: sql`(unixepoch())` })
    .where(eq(providers.id, id))
    .returning();
  return rows[0] ?? null;
}

export async function deductBalance(id: number, amount: number) {
  const db = getDb();
  const rows = await db
    .update(providers)
    .set({
      balance: sql`${providers.balance} - ${amount}`,
      updatedAt: sql`(unixepoch())`,
    })
    .where(eq(providers.id, id))
    .returning();
  return rows[0] ?? null;
}
