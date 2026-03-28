import { Hono } from "hono";
import { and, eq, gte, lte, desc, asc, sql } from "drizzle-orm";
import { z } from "zod";
import { getSqliteClient } from "../db";
import { gatewayCircuitBreaker } from "../services/gatewayService";
import { modelPriorities, providers, requestLogs, usageLogs } from "../db/schema";
import {
  createProvider,
  deleteProvider,
  getAllProviders,
  getProviderById,
  updateProvider,
} from "../services/providerService";
import {
  createModelPriority,
  deleteModelPriority,
  getModelPriorityById,
  listModelPriorities,
  updateModelPriority,
  upsertModelPriority,
} from "../services/modelPriorityService";
import {
  checkProviderHealth,
  resolveHealthCheckModel,
  runProvidersHealthCheck,
} from "../services/healthService";
import { getFailureStats } from "../services/failureStatsService";
import { getUsageSummary } from "../services/usageSummaryService";
import { providerRecoveryService } from "../services/providerRecoveryService";
import { activeRequestService } from "../services/activeRequestService";
import {
  normalizeOpenAiCompatibleModelSlug,
  normalizeOptionalOpenAiCompatibleModelSlug,
} from "../services/modelSlug";

const providerSchema = z.object({
  name: z.string().min(1),
  protocol: z.enum(["openai", "anthropic", "google", "new-api"]),
  baseUrl: z.string().min(1),
  apiKey: z.string().min(1),
  apiMode: z.enum(["responses", "chat"]).optional(),
  codexTransform: z.boolean().optional(),
  healthCheckModel: z.string().min(1).optional(),
  balance: z.number().optional(),
  inputPrice: z.number().nullable().optional(),
  outputPrice: z.number().nullable().optional(),
  isActive: z.boolean().optional(),
  priority: z.number().int().optional(),
});

const providerUpdateSchema = providerSchema.partial();

const providerTestSchema = z.object({
  name: z.string().min(1).optional(),
  protocol: z.enum(["openai", "anthropic", "google", "new-api"]),
  baseUrl: z.string().min(1),
  apiKey: z.string().min(1),
  apiMode: z.enum(["responses", "chat"]).optional(),
  codexTransform: z.boolean().optional(),
  healthCheckModel: z.string().min(1).optional(),
});

const modelPrioritySchema = z.object({
  providerId: z.number().int(),
  modelSlug: z.string().min(1),
  priority: z.number().int(),
});

const modelPriorityUpdateSchema = modelPrioritySchema.partial();

const modelPriorityImportSchema = z
  .object({
    providerId: z.number().int().optional(),
    providerName: z.string().min(1).optional(),
    modelSlug: z.string().min(1),
    priority: z.number().int(),
  })
  .refine((value) => Boolean(value.providerId || value.providerName), {
    message: "providerId or providerName required",
  });

const configImportSchema = z.object({
  providers: z.array(providerSchema),
  models: z.array(modelPriorityImportSchema).optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
  modelConflictPolicy: z.enum(["overwrite", "skip"]).optional(),
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

type HealthCheckModelPayload = Record<string, unknown>;

function normalizeHealthCheckModelPayload<T extends HealthCheckModelPayload>(payload: T): T {
  if (typeof payload.healthCheckModel === "string") {
    return {
      ...payload,
      healthCheckModel: normalizeOpenAiCompatibleModelSlug(payload.healthCheckModel),
    } as T;
  }
  if (payload.healthCheckModel !== undefined) {
    return payload;
  }
  const legacyValue = payload["health_check_model"];
  if (typeof legacyValue === "string") {
    return {
      ...payload,
      healthCheckModel: normalizeOpenAiCompatibleModelSlug(legacyValue),
    } as T;
  }
  return payload;
}

function normalizeProviderPayload(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") {
    return payload;
  }
  return normalizeHealthCheckModelPayload(payload as HealthCheckModelPayload);
}

function normalizeConfigImportPayload(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") {
    return payload;
  }
  const record = payload as Record<string, unknown>;
  if (!Array.isArray(record.providers)) {
    return record;
  }
  return {
    ...record,
    providers: record.providers.map((provider) => normalizeProviderPayload(provider)),
  };
}

function isMissingModelPriorityTable(error: unknown) {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("no such table: model_priorities") ||
    message.includes("relation \"model_priorities\" does not exist")
  );
}

function isModelPriorityUniqueViolation(error: unknown) {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("unique constraint failed: model_priorities") ||
    message.includes("model_priorities_provider_model_unique") ||
    message.includes("duplicate key value violates unique constraint")
  );
}

export const adminRoutes = new Hono();

function withRecovery(provider: Awaited<ReturnType<typeof getProviderById>>) {
  if (!provider) return provider;
  const entry = providerRecoveryService.getEntry(provider.id);
  if (!entry) return provider;
  return {
    ...provider,
    recovery: {
      state: "recovering" as const,
      triggerErrorType: entry.triggerErrorType,
      probeModel: entry.probeModel,
      startedAt: entry.startedAt,
      nextProbeAt: entry.nextProbeAt,
      lastProbeAt: entry.lastProbeAt,
      lastProbeErrorType: entry.lastProbeErrorType,
      lastProbeMessage: entry.lastProbeMessage,
    },
  };
}

adminRoutes.get("/admin/providers", async (c) => {
  const providers = await getAllProviders();
  return c.json({ providers: providers.map((provider) => withRecovery(provider)) });
});

adminRoutes.post("/admin/providers", async (c) => {
  const body = normalizeProviderPayload(await c.req.json());
  const parsed = providerSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { message: "Invalid request" } }, 400);
  }
  const provider = await createProvider(parsed.data);
  return c.json({ provider }, 201);
});

adminRoutes.patch("/admin/providers/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const body = normalizeProviderPayload(await c.req.json());
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

adminRoutes.get("/admin/model-priorities", async (c) => {
  const providerIdRaw = c.req.query("providerId");
  const modelSlug = c.req.query("modelSlug")?.trim();
  let providerId: number | undefined;
  if (providerIdRaw !== undefined) {
    const parsed = Number(providerIdRaw);
    if (!Number.isFinite(parsed)) {
      return c.json({ error: { message: "Invalid request" } }, 400);
    }
    providerId = parsed;
  }

  const conditions = [];
  if (providerId !== undefined) {
    conditions.push(eq(modelPriorities.providerId, providerId));
  }
  if (modelSlug) {
    conditions.push(eq(modelPriorities.modelSlug, modelSlug));
  }

  const db = getSqliteClient();
  const query =
    conditions.length > 0
      ? db
          .select({
            id: modelPriorities.id,
            providerId: modelPriorities.providerId,
            providerName: providers.name,
            modelSlug: modelPriorities.modelSlug,
            priority: modelPriorities.priority,
            createdAt: modelPriorities.createdAt,
            updatedAt: modelPriorities.updatedAt,
          })
          .from(modelPriorities)
          .leftJoin(providers, eq(modelPriorities.providerId, providers.id))
          .where(and(...conditions))
      : db
          .select({
            id: modelPriorities.id,
            providerId: modelPriorities.providerId,
            providerName: providers.name,
            modelSlug: modelPriorities.modelSlug,
            priority: modelPriorities.priority,
            createdAt: modelPriorities.createdAt,
            updatedAt: modelPriorities.updatedAt,
          })
          .from(modelPriorities)
          .leftJoin(providers, eq(modelPriorities.providerId, providers.id));

  try {
    const rows = await query.orderBy(desc(modelPriorities.priority), asc(modelPriorities.id));
    return c.json({ modelPriorities: rows });
  } catch (error) {
    if (isMissingModelPriorityTable(error)) {
      return c.json({ modelPriorities: [] });
    }
    throw error;
  }
});

adminRoutes.post("/admin/model-priorities", async (c) => {
  const body = await c.req.json();
  const parsed = modelPrioritySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { message: "Invalid request" } }, 400);
  }
  const provider = await getProviderById(parsed.data.providerId);
  if (!provider) {
    return c.json({ error: { message: "Provider not found" } }, 404);
  }
  try {
    const existing = await listModelPriorities({
      providerId: parsed.data.providerId,
      modelSlug: parsed.data.modelSlug,
    });
    if (existing.length > 0) {
      return c.json({ error: { message: "Model priority already exists" } }, 409);
    }
    try {
      const modelPriority = await createModelPriority(parsed.data);
      return c.json({ modelPriority }, 201);
    } catch (error) {
      if (isModelPriorityUniqueViolation(error)) {
        return c.json({ error: { message: "Model priority already exists" } }, 409);
      }
      throw error;
    }
  } catch (error) {
    if (isMissingModelPriorityTable(error)) {
      return c.json(
        { error: { message: "Model priorities not initialized. Run migrations." } },
        503
      );
    }
    throw error;
  }
});

adminRoutes.patch("/admin/model-priorities/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json();
  const parsed = modelPriorityUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { message: "Invalid request" } }, 400);
  }

  try {
    const existing = await getModelPriorityById(id);
    if (!existing) {
      return c.json({ error: { message: "Model priority not found" } }, 404);
    }

    if (parsed.data.providerId !== undefined) {
      const provider = await getProviderById(parsed.data.providerId);
      if (!provider) {
        return c.json({ error: { message: "Provider not found" } }, 404);
      }
    }

    const nextProviderId = parsed.data.providerId ?? existing.providerId;
    const nextModelSlug = parsed.data.modelSlug ?? existing.modelSlug;
    const conflicts = await listModelPriorities({
      providerId: nextProviderId,
      modelSlug: nextModelSlug,
    });
    if (conflicts.some((row) => row.id !== id)) {
      return c.json({ error: { message: "Model priority already exists" } }, 409);
    }

    try {
      const modelPriority = await updateModelPriority(id, parsed.data);
      return c.json({ modelPriority });
    } catch (error) {
      if (isModelPriorityUniqueViolation(error)) {
        return c.json({ error: { message: "Model priority already exists" } }, 409);
      }
      throw error;
    }
  } catch (error) {
    if (isMissingModelPriorityTable(error)) {
      return c.json(
        { error: { message: "Model priorities not initialized. Run migrations." } },
        503
      );
    }
    throw error;
  }
});

adminRoutes.delete("/admin/model-priorities/:id", async (c) => {
  const id = Number(c.req.param("id"));
  try {
    const modelPriority = await deleteModelPriority(id);
    if (!modelPriority) {
      return c.json({ error: { message: "Model priority not found" } }, 404);
    }
    return c.json({ modelPriority });
  } catch (error) {
    if (isMissingModelPriorityTable(error)) {
      return c.json(
        { error: { message: "Model priorities not initialized. Run migrations." } },
        503
      );
    }
    throw error;
  }
});

adminRoutes.post("/admin/providers/:id/test", async (c) => {
  const id = Number(c.req.param("id"));
  const provider = await getProviderById(id);
  if (!provider) {
    return c.json({ error: { message: "Provider not found" } }, 404);
  }

  const requestedModel = normalizeOpenAiCompatibleModelSlug(c.req.query("model")) || undefined;
  const modelSlug = resolveHealthCheckModel(provider, requestedModel);
  const result = await checkProviderHealth(provider, modelSlug, {
    recoverOnSuccess: true,
    updateRecoveryFailure: true,
  });
  if (result.status === "healthy") {
    return c.json({ ok: true, latencyMs: result.latencyMs, model: modelSlug });
  }
  return c.json({
    ok: false,
    model: modelSlug,
    errorType: result.errorType,
    message: result.message,
  });
});

adminRoutes.post("/admin/providers/test", async (c) => {
  const body = normalizeProviderPayload(await c.req.json());
  const parsed = providerTestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { message: "Invalid request" } }, 400);
  }

  const now = new Date();
  const provider = {
    id: 0,
    name: parsed.data.name ?? "Test provider",
    protocol: parsed.data.protocol,
    baseUrl: parsed.data.baseUrl,
    apiKey: parsed.data.apiKey,
    apiMode: parsed.data.apiMode ?? "responses",
    codexTransform: parsed.data.codexTransform ?? false,
    balance: 0,
    inputPrice: null,
    outputPrice: null,
    isActive: true,
    priority: 0,
    healthCheckModel: normalizeOptionalOpenAiCompatibleModelSlug(
      parsed.data.healthCheckModel
    ),
    healthStatus: "unknown" as const,
    lastHealthCheckAt: null,
    createdAt: now,
    updatedAt: now,
  };

  const requestedModel = normalizeOpenAiCompatibleModelSlug(c.req.query("model")) || undefined;
  const modelSlug = resolveHealthCheckModel(provider, requestedModel);
  const result = await checkProviderHealth(provider, modelSlug, {
    recoverOnSuccess: false,
    updateRecoveryFailure: false,
    updateHealthStatus: false,
  });
  if (result.status === "healthy") {
    return c.json({ ok: true, latencyMs: result.latencyMs, model: modelSlug });
  }
  return c.json({
    ok: false,
    model: modelSlug,
    errorType: result.errorType,
    message: result.message,
  });
});

adminRoutes.post("/admin/providers/health", async (c) => {
  const requestedModel = normalizeOpenAiCompatibleModelSlug(c.req.query("model")) || undefined;
  const results = await runProvidersHealthCheck(requestedModel, {
    recoverOnSuccess: true,
  });
  return c.json({ results });
});

adminRoutes.get("/admin/circuit-breakers", async (c) => {
  const providers = await getAllProviders();
  const openEntries = gatewayCircuitBreaker.getOpenEntries();
  const openMap = new Map(
    openEntries.map((entry) => [
      `${entry.providerId}:${entry.modelSlug ?? "*"}`,
      entry,
    ])
  );
  const recoveryMap = new Map(
    providerRecoveryService.getEntries().map((entry) => [
      `${entry.providerId}:${entry.probeModel}`,
      entry,
    ])
  );
  const providerMap = new Map(providers.map((provider) => [provider.id, provider]));
  const now = Date.now();
  const keys = new Set<string>([...openMap.keys(), ...recoveryMap.keys()]);
  const breakers = [...keys]
    .map((key) => {
      const [providerIdRaw, modelSlugRaw] = key.split(":");
      const providerId = Number(providerIdRaw);
      const provider = providerMap.get(providerId);
      if (!provider) return null;
      const openEntry = openMap.get(key) ?? null;
      const recovery = recoveryMap.get(key) ?? null;
      const state =
        openEntry && recovery
          ? "cooldown+recovering"
          : recovery
            ? "recovering"
            : "cooldown";
      const openUntil = openEntry?.openUntil ?? now;
      const remainingTarget = recovery ? recovery.nextProbeAt.getTime() : openUntil;
      const modelSlug =
        recovery?.probeModel ?? openEntry?.modelSlug ?? (modelSlugRaw === "*" ? null : modelSlugRaw);
      return {
        providerId: provider.id,
        name: provider.name,
        protocol: provider.protocol,
        modelSlug,
        openUntil,
        state,
        remainingMs: Math.max(remainingTarget - now, 0),
        nextProbeAt: recovery?.nextProbeAt ?? null,
        triggerErrorType: recovery?.triggerErrorType ?? null,
        probeModel: recovery?.probeModel ?? null,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .sort(
      (a, b) =>
        a.remainingMs - b.remainingMs ||
        a.providerId - b.providerId ||
        String(a.modelSlug ?? "").localeCompare(String(b.modelSlug ?? ""))
    );
  return c.json({ breakers });
});

adminRoutes.post("/admin/providers/:id/reset", async (c) => {
  const id = Number(c.req.param("id"));
  const provider = await getProviderById(id);
  if (!provider) {
    return c.json({ error: { message: "Provider not found" } }, 404);
  }
  gatewayCircuitBreaker.reset(id);
  providerRecoveryService.reset(id);
  return c.json({ ok: true, provider: withRecovery(provider) });
});

adminRoutes.get("/admin/failure-stats", (c) => {
  return c.json(getFailureStats());
});

adminRoutes.get("/admin/usage/summary", (c) => {
  return c.json(getUsageSummary());
});

adminRoutes.get("/admin/active-requests", (c) => {
  return c.json({ activeRequests: activeRequestService.getEntries() });
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

  const dateExpr = sql<string>`date(${usageLogs.createdAt}, 'unixepoch')`;
  const totalCost = sql<number>`coalesce(sum(${usageLogs.cost}), 0)`;
  const inputTokens = sql<number>`coalesce(sum(${usageLogs.inputTokens}), 0)`;
  const outputTokens = sql<number>`coalesce(sum(${usageLogs.outputTokens}), 0)`;
  const totalTokens = sql<number>`coalesce(sum(${usageLogs.inputTokens} + ${usageLogs.outputTokens}), 0)`;
  const requestCount = sql<number>`count(*)`;

  const summaryBase = db
    .select({
      requestCount: requestCount.as("requestCount"),
      inputTokens: inputTokens.as("inputTokens"),
      outputTokens: outputTokens.as("outputTokens"),
      totalTokens: totalTokens.as("totalTokens"),
      totalCost: totalCost.as("totalCost"),
    })
    .from(usageLogs);
  const [summary] = await (conditions.length > 0
    ? summaryBase.where(and(...conditions))
    : summaryBase);

  const trendBase = db
    .select({
      date: dateExpr.as("date"),
      requestCount: requestCount.as("requestCount"),
      inputTokens: inputTokens.as("inputTokens"),
      outputTokens: outputTokens.as("outputTokens"),
      totalTokens: totalTokens.as("totalTokens"),
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
      inputTokens: inputTokens.as("inputTokens"),
      outputTokens: outputTokens.as("outputTokens"),
      totalTokens: totalTokens.as("totalTokens"),
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
      inputTokens: inputTokens.as("inputTokens"),
      outputTokens: outputTokens.as("outputTokens"),
      totalTokens: totalTokens.as("totalTokens"),
      totalCost: totalCost.as("totalCost"),
    })
    .from(usageLogs);
  const byModel = await (conditions.length > 0
    ? modelBase.where(and(...conditions))
    : modelBase)
    .groupBy(usageLogs.modelSlug)
    .orderBy(desc(totalCost));

  return c.json({
    summary: summary ?? {
      requestCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      totalCost: 0,
    },
    trend,
    byProvider,
    byModel,
  });
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
    healthCheckModel: provider.healthCheckModel ?? undefined,
    balance: provider.balance,
    inputPrice: provider.inputPrice,
    outputPrice: provider.outputPrice,
    isActive: provider.isActive,
    priority: provider.priority,
  }));

  const db = getSqliteClient();
  let modelRows: Array<(typeof modelPriorities.$inferSelect)> = [];
  try {
    modelRows = await db.select().from(modelPriorities);
  } catch (error) {
    if (!isMissingModelPriorityTable(error)) {
      throw error;
    }
  }
  const providerNameById = new Map(providers.map((provider) => [provider.id, provider.name]));
  const exportedModels = modelRows.map((row) => ({
    providerId: row.providerId,
    providerName: providerNameById.get(row.providerId) ?? null,
    modelSlug: row.modelSlug,
    priority: row.priority,
  }));

  return c.json({
    providers: exportedProviders,
    models: exportedModels,
    settings: {
      defaultInputPrice: process.env.DEFAULT_INPUT_PRICE ?? null,
      defaultOutputPrice: process.env.DEFAULT_OUTPUT_PRICE ?? null,
    },
  });
});

adminRoutes.post("/admin/config/import", async (c) => {
  const body = normalizeConfigImportPayload(await c.req.json());
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

  const conflictPolicy = parsed.data.modelConflictPolicy ?? "overwrite";
  let importedModels = 0;
  let ignoredModels = 0;
  const modelEntries = parsed.data.models ?? [];
  if (modelEntries.length > 0) {
    const importedProviders = await getAllProviders();
    const providerById = new Map(
      importedProviders.map((provider) => [provider.id, provider])
    );
    const providerByName = new Map(
      importedProviders.map((provider) => [provider.name, provider])
    );

    for (const model of modelEntries) {
      const resolvedProvider =
        model.providerId !== undefined
          ? providerById.get(model.providerId)
          : model.providerName
            ? providerByName.get(model.providerName)
            : undefined;
      if (!resolvedProvider) {
        ignoredModels += 1;
        continue;
      }
      try {
        const existing = await listModelPriorities({
          providerId: resolvedProvider.id,
          modelSlug: model.modelSlug,
        });
        if (existing.length > 0 && conflictPolicy === "skip") {
          ignoredModels += 1;
          continue;
        }
        await upsertModelPriority({
          providerId: resolvedProvider.id,
          modelSlug: model.modelSlug,
          priority: model.priority,
        });
        importedModels += 1;
      } catch (error) {
        if (isMissingModelPriorityTable(error)) {
          ignoredModels += 1;
          continue;
        }
        throw error;
      }
    }
  }

  return c.json({
    ok: true,
    imported: created.length,
    importedModels,
    mode,
    ignoredModels,
  });
});
