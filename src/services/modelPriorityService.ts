import { and, eq, sql } from "drizzle-orm";
import { getSqliteClient } from "../db";
import { modelPriorities, type NewModelPriority } from "../db/schema";

export type ModelPriorityUpdate = Partial<NewModelPriority>;

export async function listModelPriorities(filters?: {
  providerId?: number;
  modelSlug?: string;
}) {
  const db = getSqliteClient();
  const conditions = [];
  if (filters?.providerId !== undefined) {
    conditions.push(eq(modelPriorities.providerId, filters.providerId));
  }
  if (filters?.modelSlug) {
    conditions.push(eq(modelPriorities.modelSlug, filters.modelSlug));
  }
  const query =
    conditions.length > 0
      ? db.select().from(modelPriorities).where(and(...conditions))
      : db.select().from(modelPriorities);
  return await query;
}

export async function getModelPriorityById(id: number) {
  const db = getSqliteClient();
  const rows = await db.select().from(modelPriorities).where(eq(modelPriorities.id, id));
  return rows[0] ?? null;
}

export async function createModelPriority(input: NewModelPriority) {
  const db = getSqliteClient();
  const rows = await db.insert(modelPriorities).values(input).returning();
  return rows[0] ?? null;
}

export async function updateModelPriority(id: number, input: ModelPriorityUpdate) {
  const db = getSqliteClient();
  const rows = await db
    .update(modelPriorities)
    .set({ ...input, updatedAt: sql`(unixepoch())` })
    .where(eq(modelPriorities.id, id))
    .returning();
  return rows[0] ?? null;
}

export async function deleteModelPriority(id: number) {
  const db = getSqliteClient();
  const rows = await db
    .delete(modelPriorities)
    .where(eq(modelPriorities.id, id))
    .returning();
  return rows[0] ?? null;
}

export async function upsertModelPriority(input: NewModelPriority) {
  const db = getSqliteClient();
  const existing = await db
    .select()
    .from(modelPriorities)
    .where(
      and(
        eq(modelPriorities.providerId, input.providerId),
        eq(modelPriorities.modelSlug, input.modelSlug)
      )
    );
  if (existing.length > 0) {
    const row = await updateModelPriority(existing[0].id, {
      priority: input.priority,
    });
    return row;
  }
  return await createModelPriority(input);
}
