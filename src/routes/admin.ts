import { Hono } from "hono";
import { and, eq, gte, lte, desc, sql } from "drizzle-orm";
import { z } from "zod";
import { getSqliteClient } from "../db";
import { gatewayCircuitBreaker } from "../services/gatewayService";
import { providers, requestLogs, usageLogs } from "../db/schema";
import {
  createProvider,
  deleteProvider,
  getAllProviders,
  getProviderById,
  updateProvider,
} from "../services/providerService";
import {
  callUpstreamNonStreaming,
  classifyUpstreamError,
  getUpstreamErrorMessage,
  type UpstreamRequestParams,
} from "../services/upstreamService";
import { runProvidersHealthCheck } from "../services/healthService";
import { getFailureStats } from "../services/failureStatsService";
import { getUsageSummary } from "../services/usageSummaryService";

const providerSchema = z.object({
  name: z.string().min(1),
  protocol: z.enum(["openai", "anthropic", "google", "new-api"]),
  baseUrl: z.string().min(1),
  apiKey: z.string().min(1),
  apiMode: z.enum(["responses", "chat"]).optional(),
  codexTransform: z.boolean().optional(),
  balance: z.number().optional(),
  inputPrice: z.number().nullable().optional(),
  outputPrice: z.number().nullable().optional(),
  isActive: z.boolean().optional(),
  priority: z.number().int().optional(),
});

const providerUpdateSchema = providerSchema.partial();

const configImportSchema = z.object({
  providers: z.array(providerSchema),
  models: z.array(z.unknown()).optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
  mode: z.enum(["replace", "merge"]).optional(),
});

const requestErrorTypes = [
  "quota",
  "rate_limit",
  "server",
  "auth",
  "model_not_found",
  "network",
  "unknown",
] as const;
type RequestErrorType = (typeof requestErrorTypes)[number];
const requestErrorTypeSet = new Set<string>(requestErrorTypes);

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
    await callUpstreamNonStreaming(provider, modelSlug, testParams);
    return c.json({ ok: true, latencyMs: Date.now() - start, model: modelSlug });
  } catch (err) {
    const errorType = classifyUpstreamError(err);
    return c.json({
      ok: false,
      errorType,
      message: getUpstreamErrorMessage(err),
    });
  }
});

adminRoutes.post("/admin/providers/health", async (c) => {
  const modelSlug = c.req.query("model")?.trim() || "gpt-4o";
  const results = await runProvidersHealthCheck(modelSlug);
  return c.json({ results });
});

adminRoutes.get("/admin/circuit-breakers", async (c) => {
  const providers = await getAllProviders();
  const openEntries = gatewayCircuitBreaker.getOpenEntries();
  const openMap = new Map(openEntries.map((entry) => [entry.providerId, entry.openUntil]));
  const now = Date.now();
  const breakers = providers
    .filter((provider) => openMap.has(provider.id))
    .map((provider) => {
      const openUntil = openMap.get(provider.id) ?? now;
      return {
        providerId: provider.id,
        name: provider.name,
        protocol: provider.protocol,
        openUntil,
        remainingMs: Math.max(openUntil - now, 0),
      };
    })
    .sort((a, b) => a.remainingMs - b.remainingMs || a.providerId - b.providerId);
  return c.json({ breakers });
});

adminRoutes.post("/admin/providers/:id/reset", async (c) => {
  const id = Number(c.req.param("id"));
  const provider = await getProviderById(id);
  if (!provider) {
    return c.json({ error: { message: "Provider not found" } }, 404);
  }
  gatewayCircuitBreaker.reset(id);
  return c.json({ ok: true, provider });
});

adminRoutes.get("/admin/failure-stats", (c) => {
  return c.json(getFailureStats());
});

adminRoutes.get("/admin/usage/summary", (c) => {
  return c.json(getUsageSummary());
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

adminRoutes.get("/admin/usage/stats", async (c) => {
  const db = getSqliteClient();
  const { startDate, endDate } = c.req.query();
  const conditions = [];

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

  const dateExpr = sql<string>`date(${usageLogs.createdAt}, 'unixepoch')`;
  const totalCost = sql<number>`coalesce(sum(${usageLogs.cost}), 0)`;
  const requestCount = sql<number>`count(*)`;

  const trendBase = db
    .select({
      date: dateExpr.as("date"),
      requestCount: requestCount.as("requestCount"),
      totalCost: totalCost.as("totalCost"),
    })
    .from(usageLogs);
  const trend = await (conditions.length > 0
    ? trendBase.where(and(...conditions))
    : trendBase)
    .groupBy(dateExpr)
    .orderBy(dateExpr);

  const providerBase = db
    .select({
      providerId: usageLogs.providerId,
      requestCount: requestCount.as("requestCount"),
      totalCost: totalCost.as("totalCost"),
    })
    .from(usageLogs);
  const byProvider = await (conditions.length > 0
    ? providerBase.where(and(...conditions))
    : providerBase)
    .groupBy(usageLogs.providerId)
    .orderBy(desc(totalCost));

  const modelBase = db
    .select({
      modelSlug: usageLogs.modelSlug,
      requestCount: requestCount.as("requestCount"),
      totalCost: totalCost.as("totalCost"),
    })
    .from(usageLogs);
  const byModel = await (conditions.length > 0
    ? modelBase.where(and(...conditions))
    : modelBase)
    .groupBy(usageLogs.modelSlug)
    .orderBy(desc(totalCost));

  return c.json({ trend, byProvider, byModel });
});

adminRoutes.get("/admin/request-logs", async (c) => {
  const db = getSqliteClient();
  const { providerId, modelSlug, startDate, endDate, errorType } = c.req.query();
  const limit = Number(c.req.query("limit") ?? 50);
  const offset = Number(c.req.query("offset") ?? 0);
  const resolvedLimit = Number.isFinite(limit) ? limit : 50;
  const resolvedOffset = Number.isFinite(offset) ? offset : 0;
  const conditions = [];

  if (providerId) {
    conditions.push(eq(requestLogs.providerId, Number(providerId)));
  }
  if (modelSlug) {
    conditions.push(eq(requestLogs.modelSlug, modelSlug));
  }
  if (errorType && requestErrorTypeSet.has(errorType)) {
    conditions.push(eq(requestLogs.errorType, errorType as RequestErrorType));
  }
  if (startDate) {
    const date = new Date(startDate);
    if (!Number.isNaN(date.valueOf())) {
      conditions.push(gte(requestLogs.createdAt, date));
    }
  }
  if (endDate) {
    const date = new Date(endDate);
    if (!Number.isNaN(date.valueOf())) {
      conditions.push(lte(requestLogs.createdAt, date));
    }
  }

  const query =
    conditions.length > 0
      ? db.select().from(requestLogs).where(and(...conditions))
      : db.select().from(requestLogs);
  const rows = await query
    .orderBy(desc(requestLogs.createdAt))
    .limit(resolvedLimit)
    .offset(resolvedOffset);

  return c.json({
    requests: rows,
    limit: resolvedLimit,
    offset: resolvedOffset,
  });
});

adminRoutes.get("/admin/config/export", async (c) => {
  const providers = await getAllProviders();
  const exportedProviders = providers.map((provider) => ({
    name: provider.name,
    protocol: provider.protocol,
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey,
    apiMode: provider.apiMode,
    codexTransform: provider.codexTransform,
    balance: provider.balance,
    inputPrice: provider.inputPrice,
    outputPrice: provider.outputPrice,
    isActive: provider.isActive,
    priority: provider.priority,
  }));

  return c.json({
    providers: exportedProviders,
    models: [],
    settings: {
      defaultInputPrice: process.env.DEFAULT_INPUT_PRICE ?? null,
      defaultOutputPrice: process.env.DEFAULT_OUTPUT_PRICE ?? null,
    },
  });
});

adminRoutes.post("/admin/config/import", async (c) => {
  const body = await c.req.json();
  const parsed = configImportSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { message: "Invalid request" } }, 400);
  }

  const mode = parsed.data.mode ?? "replace";
  const db = getSqliteClient();
  if (mode === "replace") {
    db.delete(providers).run();
  }

  const created = [];
  for (const provider of parsed.data.providers) {
    const row = await createProvider(provider);
    if (row) created.push(row);
  }

  return c.json({
    ok: true,
    imported: created.length,
    mode,
    ignoredModels: parsed.data.models?.length ?? 0,
  });
});
