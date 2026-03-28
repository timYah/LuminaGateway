import { Hono } from "hono";
import type { z } from "zod";
import {
  handleRequest,
  handleStreamingRequest,
  type ClientFormat,
  type GatewayRequestParams,
} from "../services/gatewayService";
import { responseCache, resolveCacheTtlMs } from "../services/cacheService";
import { isContentBlocked } from "../services/contentSafetyService";
import { extractJwtIdentity, resolveJwtConfig, verifyJwt } from "../services/jwtService";
import { estimateUsage } from "../services/requestEstimator";
import { tokenRateLimiter } from "../services/tokenRateLimiter";
import { groupQuotaTracker, keyQuotaTracker, userQuotaTracker } from "../services/quotaService";
import { recordUsage } from "../services/usageSummaryService";
import { normalizeAuthToken } from "../utils/auth";
import { resolveRequestId } from "../utils/requestContext";
import { activeRequestService } from "../services/activeRequestService";

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

    const jwtConfig = resolveJwtConfig();
    const jwtHeaderValue = jwtConfig.enabled ? c.req.header(jwtConfig.header) : undefined;
    const jwtToken = jwtConfig.enabled ? normalizeAuthToken(jwtHeaderValue) : "";
    const jwtVerification = jwtConfig.enabled && jwtToken ? verifyJwt(jwtToken, jwtConfig.secret) : null;
    let jwtIdentity: { userId: string; groups: string[] } | null = null;

    if (jwtConfig.enabled) {
      if (!jwtToken || !jwtVerification?.ok) {
        return c.json({ error: { message: "Unauthorized" } }, 401);
      }
      const identity = extractJwtIdentity(
        jwtVerification.payload,
        jwtConfig.userClaim,
        jwtConfig.groupClaim
      );
      if (!identity.userId) {
        return c.json({ error: { message: "Unauthorized" } }, 401);
      }
      jwtIdentity = identity;
    }

    if (isContentBlocked(usageEstimate.text)) {
      return c.json({ error: { message: "Content blocked" } }, 403);
    }

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
    }

    if (authToken) {
      const quota = keyQuotaTracker.canConsume(authToken, usageEstimate);
      if (!quota.allowed) {
        return c.json({ error: { message: "Quota exceeded" } }, 429);
      }
    }

    if (jwtIdentity) {
      const userQuota = userQuotaTracker.canConsume(jwtIdentity.userId, usageEstimate);
      if (!userQuota.allowed) {
        return c.json({ error: { message: "User quota exceeded" } }, 429);
      }
      for (const group of jwtIdentity.groups) {
        const groupQuota = groupQuotaTracker.canConsume(group, usageEstimate);
        if (!groupQuota.allowed) {
          return c.json({ error: { message: "Group quota exceeded" } }, 429);
        }
      }
    }

    if (authToken) {
      keyQuotaTracker.consume(authToken, usageEstimate);
    }
    if (jwtIdentity) {
      userQuotaTracker.consume(jwtIdentity.userId, usageEstimate);
      for (const group of jwtIdentity.groups) {
        groupQuotaTracker.consume(group, usageEstimate);
      }
    }

    if (authToken) {
      recordUsage({
        apiKey: authToken,
        route: options.path,
        totalTokens: usageEstimate.totalTokens,
        estimatedCostUsd: usageEstimate.estimatedCostUsd,
      });
    }

    const requestId = resolveRequestId(c);

    if ((merged as { stream?: boolean }).stream) {
      activeRequestService.startRequest({
        requestId,
        path: options.path,
        modelSlug,
      });
      try {
        const response = await handleStreamingRequest(
          options.converter(merged),
          options.clientFormat,
          { requestId, routePath: options.path }
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
        activeRequestService.finishRequest(requestId);
        return c.json(response.body, response.status);
      } catch (error) {
        activeRequestService.finishRequest(requestId);
        throw error;
      }
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

    activeRequestService.startRequest({
      requestId,
      path: options.path,
      modelSlug,
    });
    try {
      const response = await handleRequest(
        options.converter(merged),
        options.clientFormat,
        { requestId, routePath: options.path }
      );
      if (cacheTtlMs && cacheKey && response.status === 200) {
        responseCache.set(cacheKey, {
          status: response.status,
          body: response.body,
          expiresAt: Date.now() + cacheTtlMs,
        });
      }
      return c.json(response.body, response.status);
    } finally {
      activeRequestService.finishRequest(requestId);
    }
  });

  return app;
}
