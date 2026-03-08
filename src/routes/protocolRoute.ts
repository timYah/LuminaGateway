import { Hono } from "hono";
import type { z } from "zod";
import {
  handleRequest,
  handleStreamingRequest,
  type ClientFormat,
  type GatewayRequestParams,
} from "../services/gatewayService";
import { responseCache, resolveCacheTtlMs } from "../services/cacheService";
import { estimateUsage } from "../services/requestEstimator";
import { tokenRateLimiter } from "../services/tokenRateLimiter";
import { keyQuotaTracker } from "../services/quotaService";
import { normalizeAuthToken } from "../utils/auth";

type ProtocolRouteOptions<T extends z.ZodTypeAny> = {
  path: string;
  schema: T;
  converter: (data: z.infer<T>) => GatewayRequestParams;
  clientFormat: ClientFormat;
};

function parseEnvList(value: string | undefined) {
  if (!value) return null;
  const entries = value
    .split(/[,\n]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  if (entries.length === 0) return null;
  return new Set(entries);
}

function isModelAllowed(model: string) {
  const allowlist = parseEnvList(process.env.MODEL_ALLOWLIST);
  if (allowlist && !allowlist.has(model)) {
    return false;
  }
  const blocklist = parseEnvList(process.env.MODEL_BLOCKLIST);
  if (blocklist && blocklist.has(model)) {
    return false;
  }
  return true;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const entries = Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(
      (value as Record<string, unknown>)[key]
    )}`);
  return `{${entries.join(",")}}`;
}

let cachedDefaultsRaw: string | undefined;
let cachedDefaults: Record<string, unknown> | null = null;

function resolveDefaultRequestParams() {
  const raw = process.env.DEFAULT_REQUEST_PARAMS;
  if (!raw) return null;
  if (raw === cachedDefaultsRaw) return cachedDefaults;
  cachedDefaultsRaw = raw;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      cachedDefaults = parsed as Record<string, unknown>;
      return cachedDefaults;
    }
  } catch (error) {
    console.warn("[gateway] invalid DEFAULT_REQUEST_PARAMS", error);
  }
  cachedDefaults = null;
  return null;
}

export function createProtocolRoute<T extends z.ZodTypeAny>(
  options: ProtocolRouteOptions<T>
) {
  const app = new Hono();

  app.post(options.path, async (c) => {
    const body = await c.req.json();
    const parsed = options.schema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: { message: "Invalid request" } }, 400);
    }

    const defaults = resolveDefaultRequestParams();
    const payload = parsed.data as Record<string, unknown>;
    const merged = defaults
      ? ({ ...defaults, ...payload } as z.infer<T>)
      : parsed.data;

    const modelValue = (merged as { model?: unknown }).model;
    const modelSlug = typeof modelValue === "string" ? modelValue.trim() : "";
    if (modelSlug && !isModelAllowed(modelSlug)) {
      return c.json({ error: { message: "Model not allowed" } }, 403);
    }

    const usageEstimate = estimateUsage(options.clientFormat, merged as Record<string, unknown>);
    const authToken = normalizeAuthToken(c.req.header("Authorization"));
    if (authToken) {
      const limit = tokenRateLimiter.consume(authToken, usageEstimate.totalTokens);
      if (!limit.allowed) {
        return c.json(
          { error: { message: "Token rate limit exceeded" } },
          429,
          limit.retryAfter ? { "Retry-After": limit.retryAfter.toString() } : undefined
        );
      }

      const quota = keyQuotaTracker.consume(authToken, usageEstimate);
      if (!quota.allowed) {
        return c.json({ error: { message: "Quota exceeded" } }, 429);
      }
    }

    if ((merged as { stream?: boolean }).stream) {
      const response = await handleStreamingRequest(
        options.converter(merged),
        options.clientFormat
      );
      if ("stream" in response) {
        return new Response(response.stream, {
          status: response.status,
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        });
      }
      return c.json(response.body, response.status);
    }

    const cacheTtlMs = resolveCacheTtlMs(c.req.header("x-cache-ttl-ms"));
    const cacheKey = cacheTtlMs
      ? `${options.clientFormat}:${options.path}:${stableStringify(merged)}`
      : null;
    if (cacheTtlMs && cacheKey) {
      const cached = responseCache.get(cacheKey);
      if (cached) {
        return c.json(cached.body, cached.status);
      }
    }

    const response = await handleRequest(
      options.converter(merged),
      options.clientFormat
    );
    if (cacheTtlMs && cacheKey && response.status === 200) {
      responseCache.set(cacheKey, {
        status: response.status,
        body: response.body,
        expiresAt: Date.now() + cacheTtlMs,
      });
    }
    return c.json(response.body, response.status);
  });

  return app;
}
