import { Hono } from "hono";
import { and, eq, gte, lte, desc } from "drizzle-orm";
import { z } from "zod";
import { getDb, type SqliteDatabase } from "../db";
import { usageLogs } from "../db/schema";
import {
  createProvider,
  getAllProviders,
  updateProvider,
} from "../services/providerService";

const providerSchema = z.object({
  name: z.string().min(1),
  protocol: z.enum(["openai", "anthropic", "google"]),
  baseUrl: z.string().min(1),
  apiKey: z.string().min(1),
  balance: z.number().optional(),
  isActive: z.boolean().optional(),
  priority: z.number().int().optional(),
});

function getClient() {
  return getDb() as SqliteDatabase;
}

export const adminRoutes = new Hono();

adminRoutes.get("/admin/providers", async (c) => {
  const providers = await getAllProviders();
  return c.json({ providers });
});

adminRoutes.post("/admin/providers", async (c) => {
  const body = await c.req.json();
  const parsed = providerSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { message: "Invalid request" } }, 400);
  }
  const provider = await createProvider(parsed.data);
  return c.json({ provider }, 201);
});

adminRoutes.patch("/admin/providers/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json();
  const provider = await updateProvider(id, body);
  if (!provider) {
    return c.json({ error: { message: "Provider not found" } }, 404);
  }
  return c.json({ provider });
});

adminRoutes.get("/admin/usage", async (c) => {
  const db = getClient();
  const { providerId, modelSlug, startDate, endDate } = c.req.query();
  const conditions = [];

  if (providerId) {
    conditions.push(eq(usageLogs.providerId, Number(providerId)));
  }
  if (modelSlug) {
    conditions.push(eq(usageLogs.modelSlug, modelSlug));
  }
  if (startDate) {
    const date = new Date(startDate);
    if (!Number.isNaN(date.valueOf())) {
      conditions.push(gte(usageLogs.createdAt, date));
    }
  }
  if (endDate) {
    const date = new Date(endDate);
    if (!Number.isNaN(date.valueOf())) {
      conditions.push(lte(usageLogs.createdAt, date));
    }
  }

  const query =
    conditions.length > 0
      ? db.select().from(usageLogs).where(and(...conditions))
      : db.select().from(usageLogs);
  const rows = await query.orderBy(desc(usageLogs.createdAt));
  return c.json({ usage: rows });
});
