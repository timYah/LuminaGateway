import { Hono } from "hono";
import { and, eq, gte, lte, desc } from "drizzle-orm";
import { z } from "zod";
import { getDb, type SqliteDatabase } from "../db";
import { usageLogs } from "../db/schema";
import {
  createProvider,
  deleteProvider,
  getAllProviders,
  updateProvider,
} from "../services/providerService";
import {
  createModelMapping,
  getAllModelMappings,
  updateModelMapping,
} from "../services/modelService";

const providerSchema = z.object({
  name: z.string().min(1),
  protocol: z.enum(["openai", "anthropic", "google", "new-api"]),
  baseUrl: z.string().min(1),
  apiKey: z.string().min(1),
  balance: z.number().optional(),
  isActive: z.boolean().optional(),
  priority: z.number().int().optional(),
});

const modelSchema = z.object({
  providerId: z.number().int(),
  slug: z.string().min(1),
  upstreamName: z.string().min(1),
  inputPrice: z.number().optional(),
  outputPrice: z.number().optional(),
});

const modelUpdateSchema = modelSchema.partial();

function getClient() {
  return getDb() as SqliteDatabase;
}

export const adminRoutes = new Hono();

adminRoutes.get("/admin/providers", async (c) => {
  const providers = await getAllProviders();
  return c.json({ providers });
});

adminRoutes.get("/admin/models", async (c) => {
  const { providerId, slug } = c.req.query();
  const filters: { providerId?: number; slug?: string } = {};

  if (providerId) {
    const parsed = Number(providerId);
    if (Number.isFinite(parsed)) {
      filters.providerId = parsed;
    }
  }

  if (slug && slug.trim()) {
    filters.slug = slug.trim();
  }

  const models = await getAllModelMappings(filters);
  return c.json({ models });
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

adminRoutes.post("/admin/models", async (c) => {
  const body = await c.req.json();
  const parsed = modelSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { message: "Invalid request" } }, 400);
  }
  const model = await createModelMapping(parsed.data);
  return c.json({ model }, 201);
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

adminRoutes.delete("/admin/providers/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const provider = await deleteProvider(id);
  if (!provider) {
    return c.json({ error: { message: "Provider not found" } }, 404);
  }
  return c.json({ provider });
});

adminRoutes.patch("/admin/models/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json();
  const parsed = modelUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { message: "Invalid request" } }, 400);
  }
  const model = await updateModelMapping(id, parsed.data);
  if (!model) {
    return c.json({ error: { message: "Model mapping not found" } }, 404);
  }
  return c.json({ model });
});

adminRoutes.get("/admin/usage", async (c) => {
  const db = getClient();
  const { providerId, modelSlug, startDate, endDate } = c.req.query();
  const limit = Number(c.req.query("limit") ?? 50);
  const offset = Number(c.req.query("offset") ?? 0);
  const resolvedLimit = Number.isFinite(limit) ? limit : 50;
  const resolvedOffset = Number.isFinite(offset) ? offset : 0;
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
  const rows = await query
    .orderBy(desc(usageLogs.createdAt))
    .limit(resolvedLimit)
    .offset(resolvedOffset);
  return c.json({ usage: rows, limit: resolvedLimit, offset: resolvedOffset });
});
