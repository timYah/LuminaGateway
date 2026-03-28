import { eq, sql } from "drizzle-orm";
import { getSqliteClient } from "../db";
import { type NewProvider, type ProviderHealthStatus, providers } from "../db/schema";
import { normalizeOptionalOpenAiCompatibleModelSlug } from "./modelSlug";

function normalizeProviderRecord<T extends { healthCheckModel?: string | null }>(provider: T) {
  return {
    ...provider,
    healthCheckModel: normalizeOptionalOpenAiCompatibleModelSlug(provider.healthCheckModel),
  } as T;
}

function normalizeProviderWrite<T extends { healthCheckModel?: string | null }>(data: T) {
  if (data.healthCheckModel === undefined) {
    return data;
  }
  return {
    ...data,
    healthCheckModel: normalizeOptionalOpenAiCompatibleModelSlug(data.healthCheckModel),
  } as T;
}

export async function getAllProviders() {
  const db = getSqliteClient();
  const rows = await db.select().from(providers);
  return rows.map((provider) => normalizeProviderRecord(provider));
}

export async function getProviderById(id: number) {
  const db = getSqliteClient();
  const rows = await db.select().from(providers).where(eq(providers.id, id));
  return rows[0] ? normalizeProviderRecord(rows[0]) : null;
}

export async function createProvider(data: NewProvider) {
  const db = getSqliteClient();
  const rows = await db.insert(providers).values(normalizeProviderWrite(data)).returning();
  return rows[0] ? normalizeProviderRecord(rows[0]) : null;
}

export type ProviderUpdate = Partial<NewProvider>;

export async function updateProvider(id: number, data: ProviderUpdate) {
  const db = getSqliteClient();
  const rows = await db
    .update(providers)
    .set({ ...normalizeProviderWrite(data), updatedAt: sql`(unixepoch())` })
    .where(eq(providers.id, id))
    .returning();
  return rows[0] ? normalizeProviderRecord(rows[0]) : null;
}

export async function deactivateProvider(id: number) {
  const db = getSqliteClient();
  const rows = await db
    .update(providers)
    .set({ isActive: false, updatedAt: sql`(unixepoch())` })
    .where(eq(providers.id, id))
    .returning();
  return rows[0] ? normalizeProviderRecord(rows[0]) : null;
}

export async function deductBalance(id: number, amount: number) {
  const db = getSqliteClient();
  const rows = await db
    .update(providers)
    .set({
      balance: sql`${providers.balance} - ${amount}`,
      updatedAt: sql`(unixepoch())`,
    })
    .where(eq(providers.id, id))
    .returning();
  return rows[0] ? normalizeProviderRecord(rows[0]) : null;
}

export async function deleteProvider(id: number) {
  const db = getSqliteClient();
  const rows = await db
    .delete(providers)
    .where(eq(providers.id, id))
    .returning();
  return rows[0] ? normalizeProviderRecord(rows[0]) : null;
}

export async function updateProviderHealth(
  id: number,
  healthStatus: ProviderHealthStatus,
  checkedAt: Date = new Date()
) {
  const db = getSqliteClient();
  const rows = await db
    .update(providers)
    .set({
      healthStatus,
      lastHealthCheckAt: checkedAt,
      updatedAt: sql`(unixepoch())`,
    })
    .where(eq(providers.id, id))
    .returning();
  return rows[0] ? normalizeProviderRecord(rows[0]) : null;
}
