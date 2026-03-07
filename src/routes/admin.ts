import { Hono } from "hono";
import { and, eq, gte, lte, desc } from "drizzle-orm";
import { z } from "zod";
import { getSqliteClient } from "../db";
import { usageLogs } from "../db/schema";
import {
  createProvider,
  deleteProvider,
  getAllProviders,
  getProviderById,
  updateProvider,
} from "../services/providerService";
import {
  callUpstreamNonStreaming,
  callUpstreamStreaming,
  classifyUpstreamError,
  type UpstreamRequestParams,
} from "../services/upstreamService";
import { runProvidersHealthCheck } from "../services/healthService";
import { getFailureStats } from "../services/failureStatsService";

const providerSchema = z.object({
  name: z.string().min(1),
  protocol: z.enum(["openai", "anthropic", "google", "new-api"]),
  baseUrl: z.string().min(1),
  apiKey: z.string().min(1),
  apiMode: z.enum(["responses", "chat"]).optional(),
  balance: z.number().optional(),
  inputPrice: z.number().nullable().optional(),
  outputPrice: z.number().nullable().optional(),
  isActive: z.boolean().optional(),
  priority: z.number().int().optional(),
});

const providerUpdateSchema = providerSchema.partial();

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
  const parsed = providerUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { message: "Invalid request" } }, 400);
  }
  const provider = await updateProvider(id, parsed.data);
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

adminRoutes.post("/admin/providers/:id/test", async (c) => {
  const id = Number(c.req.param("id"));
  const provider = await getProviderById(id);
  if (!provider) {
    return c.json({ error: { message: "Provider not found" } }, 404);
  }

  const modelSlug = c.req.query("model")?.trim() || "gpt-4o";
  const start = Date.now();
  try {
    const testParams: UpstreamRequestParams = {
      messages: [{ role: "user", content: "hi" }],
      maxOutputTokens: 1,
    };
    if (provider.protocol === "new-api") {
      const upstream = callUpstreamStreaming(provider, modelSlug, testParams);
      const iterator = upstream.stream[Symbol.asyncIterator]();
      await iterator.next();
      if (iterator.return) {
        await iterator.return();
      }
    } else {
      await callUpstreamNonStreaming(provider, modelSlug, testParams);
    }
    return c.json({ ok: true, latencyMs: Date.now() - start, model: modelSlug });
  } catch (err) {
    const errorType = classifyUpstreamError(err);
    return c.json({
      ok: false,
      errorType,
      message: err instanceof Error ? err.message : "Unknown error",
    });
  }
});

adminRoutes.post("/admin/providers/health", async (c) => {
  const modelSlug = c.req.query("model")?.trim() || "gpt-4o";
  const results = await runProvidersHealthCheck(modelSlug);
  return c.json({ results });
});

adminRoutes.get("/admin/failure-stats", (c) => {
  return c.json(getFailureStats());
});

adminRoutes.get("/admin/usage", async (c) => {
  const db = getSqliteClient();
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
