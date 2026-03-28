import { APICallError } from "ai";
import { Hono, type Context } from "hono";
import type { Provider } from "../db/schema/providers";
import { isContentBlocked } from "../services/contentSafetyService";
import { recordFailure } from "../services/failureStatsService";
import { gatewayCircuitBreaker, gatewayRouter } from "../services/gatewayService";
import { gatewayInflightLimiter } from "../services/inflightService";
import { extractJwtIdentity, resolveJwtConfig, verifyJwt } from "../services/jwtService";
import { applyProviderFailurePolicy } from "../services/providerFailurePolicy";
import { createRequestLog } from "../services/requestLogService";
import { estimateUsage } from "../services/requestEstimator";
import { activeRequestService } from "../services/activeRequestService";
import { wrapStreamWithFinalizer } from "../services/streamUtils";
import { tokenRateLimiter } from "../services/tokenRateLimiter";
import { groupQuotaTracker, keyQuotaTracker, userQuotaTracker } from "../services/quotaService";
import {
  persistEstimatedUsageLog,
  resolveUsageCost,
} from "../services/usageLogService";
import { recordUsage } from "../services/usageSummaryService";
import { classifyUpstreamError, getUpstreamErrorMessage } from "../services/upstreamService";
import { normalizeAuthToken } from "../utils/auth";
import { resolveRequestId } from "../utils/requestContext";
import { collectEstimatedOutputTokensFromStream } from "../services/requestEstimator";

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "content-length",
  "host",
]);

type GatewayErrorResponse = {
  error: { message: string; type: string; code: string };
};

type StoredFailureResponse = {
  status: number;
  bodyText: string;
  headers: Headers;
};

function buildGatewayError(message: string): GatewayErrorResponse {
  return {
    error: {
      message,
      type: "gateway_error",
      code: "gateway_error",
    },
  };
}

function buildGatewayErrorResponse(message: string, status: number) {
  return Response.json(buildGatewayError(message), { status });
}

function parseJson(text: string) {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function normalizeAnthropicBaseUrl(baseUrl: string) {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (!trimmed) return trimmed;
  return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
}

function resolveClaudeTimeoutMs() {
  const raw = process.env.CLAUDE_UPSTREAM_TIMEOUT_MS;
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function buildTimeoutError() {
  const error = new Error("Upstream request timed out");
  (error as { code?: string }).code = "UND_ERR_REQUEST_TIMEOUT";
  return error;
}

function isClaudePassthroughCandidate(provider: Provider) {
  return provider.protocol === "anthropic";
}

function buildUpstreamUrl(provider: Provider, requestUrl: string) {
  const upstreamUrl = new URL(`${normalizeAnthropicBaseUrl(provider.baseUrl)}/messages`);
  upstreamUrl.search = new URL(requestUrl).search;
  return upstreamUrl.toString();
}

function buildUpstreamHeaders(source: Headers, apiKey: string) {
  const headers = new Headers();
  source.forEach((value, key) => {
    const normalizedKey = key.toLowerCase();
    if (
      HOP_BY_HOP_HEADERS.has(normalizedKey) ||
      normalizedKey === "authorization" ||
      normalizedKey === "x-api-key"
    ) {
      return;
    }
    headers.set(key, value);
  });
  headers.set("x-api-key", apiKey);
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  return headers;
}

function filterResponseHeaders(source: Headers) {
  const headers = new Headers();
  source.forEach((value, key) => {
    if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) return;
    headers.set(key, value);
  });
  return headers;
}

function toHeaderRecord(headers: Headers) {
  return Object.fromEntries(headers.entries());
}

async function recordRequestLogSafe(input: Parameters<typeof createRequestLog>[0]) {
  try {
    await createRequestLog(input);
  } catch (error) {
    console.error("[claude] request log failed", error);
  }
}

async function persistEstimatedUsageSafe(
  input: Parameters<typeof persistEstimatedUsageLog>[0]
) {
  try {
    await persistEstimatedUsageLog(input);
  } catch (error) {
    console.error("[claude] usage log failed", error);
  }
}

function buildEstimatedUsageInput(
  provider: Provider,
  modelSlug: string,
  inputTokens: number,
  outputTokens: number,
  routePath: string,
  requestId: string
): Parameters<typeof persistEstimatedUsageLog>[0] {
  return {
    provider,
    modelSlug,
    inputTokens,
    outputTokens,
    routePath,
    requestId,
    costUsd: resolveUsageCost(provider, {
      inputTokens,
      outputTokens,
    }),
  };
}

function buildApiCallError(
  response: Response,
  url: string,
  requestBody: unknown,
  responseBody: string
) {
  const data = parseJson(responseBody);
  return new APICallError({
    message:
      typeof data === "object" && data && "error" in (data as Record<string, unknown>)
        ? "Upstream request failed"
        : `Upstream request failed with status ${response.status}`,
    url,
    requestBodyValues: requestBody,
    statusCode: response.status,
    responseHeaders: toHeaderRecord(response.headers),
    responseBody,
    isRetryable: response.status >= 500 || response.status === 429,
    data: data ?? undefined,
  });
}

export const claudeRoutes = new Hono();

async function handleClaudeMessagesRequest(c: Context) {
  const rawBody = await c.req.text();
  const parsedBody = parseJson(rawBody);
  if (!parsedBody || typeof parsedBody !== "object" || Array.isArray(parsedBody)) {
    return buildGatewayErrorResponse("Invalid request", 400);
  }

  const modelValue = (parsedBody as { model?: unknown }).model;
  const modelSlug = typeof modelValue === "string" ? modelValue.trim() : "";
  if (!modelSlug) {
    return buildGatewayErrorResponse("Invalid request", 400);
  }

  const usageEstimate = estimateUsage("anthropic", parsedBody as Record<string, unknown>);

  const jwtConfig = resolveJwtConfig();
  const jwtHeaderValue = jwtConfig.enabled ? c.req.header(jwtConfig.header) : undefined;
  const jwtToken = jwtConfig.enabled ? normalizeAuthToken(jwtHeaderValue) : "";
  const jwtVerification = jwtConfig.enabled && jwtToken ? verifyJwt(jwtToken, jwtConfig.secret) : null;
  let jwtIdentity: { userId: string; groups: string[] } | null = null;

  if (jwtConfig.enabled) {
    if (!jwtToken || !jwtVerification?.ok) {
      return buildGatewayErrorResponse("Unauthorized", 401);
    }
    const identity = extractJwtIdentity(
      jwtVerification.payload,
      jwtConfig.userClaim,
      jwtConfig.groupClaim
    );
    if (!identity.userId) {
      return buildGatewayErrorResponse("Unauthorized", 401);
    }
    jwtIdentity = identity;
  }

  if (isContentBlocked(usageEstimate.text)) {
    return buildGatewayErrorResponse("Content blocked", 403);
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
      return buildGatewayErrorResponse("Quota exceeded", 429);
    }
  }

  if (jwtIdentity) {
    const userQuota = userQuotaTracker.canConsume(jwtIdentity.userId, usageEstimate);
    if (!userQuota.allowed) {
      return buildGatewayErrorResponse("User quota exceeded", 429);
    }
    for (const group of jwtIdentity.groups) {
      const groupQuota = groupQuotaTracker.canConsume(group, usageEstimate);
      if (!groupQuota.allowed) {
        return buildGatewayErrorResponse("Group quota exceeded", 429);
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

  const routePath = c.req.path;

  if (authToken) {
    recordUsage({
      apiKey: authToken,
      route: routePath,
      totalTokens: usageEstimate.totalTokens,
      estimatedCostUsd: usageEstimate.estimatedCostUsd,
    });
  }

  const requestId = resolveRequestId(c);
  activeRequestService.startRequest({
    requestId,
    path: routePath,
    modelSlug,
  });

  const candidates = (await gatewayRouter.getAllCandidates(modelSlug)).filter(
    isClaudePassthroughCandidate
  );
  if (candidates.length === 0) {
    activeRequestService.finishRequest(requestId);
    return buildGatewayErrorResponse("No provider available", 503);
  }

  let lastFailureResponse: StoredFailureResponse | null = null;

  const timeoutMs = resolveClaudeTimeoutMs();

  for (const provider of candidates) {
    if (!gatewayInflightLimiter.tryAcquire(provider.id, provider.name)) {
      continue;
    }
    activeRequestService.startAttempt({
      requestId,
      providerId: provider.id,
      providerName: provider.name,
    });
    const start = Date.now();
    const upstreamUrl = buildUpstreamUrl(provider, c.req.url);
    const abortController = timeoutMs ? new AbortController() : null;
    const timeoutId =
      timeoutMs && abortController
        ? setTimeout(() => {
            abortController.abort();
          }, timeoutMs)
        : null;
    const release = () => gatewayInflightLimiter.release(provider.id);
    try {
      const upstreamResponse = await fetch(upstreamUrl, {
        method: c.req.method,
        headers: buildUpstreamHeaders(c.req.raw.headers, provider.apiKey),
        body: rawBody,
        signal: abortController?.signal,
      });
      if (timeoutId) clearTimeout(timeoutId);

      if (upstreamResponse.ok) {
        const responseBody = upstreamResponse.body;
        const headers = filterResponseHeaders(upstreamResponse.headers);
        if (!responseBody) {
          await persistEstimatedUsageSafe(
            buildEstimatedUsageInput(
              provider,
              modelSlug,
              usageEstimate.inputTokens,
              0,
              routePath,
              requestId
            )
          );
          await recordRequestLogSafe({
            providerId: provider.id,
            requestId,
            modelSlug,
            result: "success",
            latencyMs: Date.now() - start,
          });
          release();
          activeRequestService.finishRequest(requestId);
          return new Response(null, {
            status: upstreamResponse.status,
            headers,
          });
        }
        const [clientBody, captureBody] = responseBody.tee();
        const outputTokensPromise = collectEstimatedOutputTokensFromStream(
          "anthropic",
          captureBody,
          upstreamResponse.headers.get("content-type")
        );
        return new Response(
          wrapStreamWithFinalizer(clientBody, {
            onComplete: async () => {
              const outputTokens = await outputTokensPromise;
              await persistEstimatedUsageSafe(
                buildEstimatedUsageInput(
                  provider,
                  modelSlug,
                  usageEstimate.inputTokens,
                  outputTokens,
                  routePath,
                  requestId
                )
              );
              await recordRequestLogSafe({
                providerId: provider.id,
                requestId,
                modelSlug,
                result: "success",
                latencyMs: Date.now() - start,
              });
            },
            onError: async (streamError) => {
              const errorType = classifyUpstreamError(streamError);
              const message = getUpstreamErrorMessage(streamError);
              activeRequestService.failAttempt({
                requestId,
                providerId: provider.id,
                errorType,
              });
              await recordRequestLogSafe({
                providerId: provider.id,
                requestId,
                modelSlug,
                result: "failure",
                errorType,
                latencyMs: Date.now() - start,
              });
              recordFailure(provider.id, errorType);
              console.warn("[claude] upstream stream failed after first byte", {
                providerId: provider.id,
                providerName: provider.name,
                errorType,
                message,
              });
              await applyProviderFailurePolicy({
                breaker: gatewayCircuitBreaker,
                providerId: provider.id,
                modelSlug,
                errorType,
              });
            },
            onFinalize: () => {
              release();
              activeRequestService.finishRequest(requestId);
            },
          }),
          {
            status: upstreamResponse.status,
            headers,
          }
        );
      }

      const responseBody = await upstreamResponse.text();
      const error = buildApiCallError(upstreamResponse, upstreamUrl, parsedBody, responseBody);
      const errorType = classifyUpstreamError(error);
      const message = getUpstreamErrorMessage(error);

      activeRequestService.failAttempt({
        requestId,
        providerId: provider.id,
        errorType,
      });
      await recordRequestLogSafe({
        providerId: provider.id,
        requestId,
        modelSlug,
        result: "failure",
        errorType,
        latencyMs: Date.now() - start,
      });
      recordFailure(provider.id, errorType);
      console.warn("[claude] upstream response failed before first byte", {
        providerId: provider.id,
        providerName: provider.name,
        status: upstreamResponse.status,
        errorType,
        message,
      });

      lastFailureResponse = {
        status: upstreamResponse.status,
        bodyText: responseBody,
        headers: filterResponseHeaders(upstreamResponse.headers),
      };

      release();
      const shouldFailover = await applyProviderFailurePolicy({
        breaker: gatewayCircuitBreaker,
        providerId: provider.id,
        modelSlug,
        errorType,
      });
      if (shouldFailover) continue;

      activeRequestService.finishRequest(requestId);
      return new Response(responseBody || null, {
        status: upstreamResponse.status,
        headers: lastFailureResponse.headers,
      });
    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId);
      const normalizedError = timeoutMs && isAbortError(error) ? buildTimeoutError() : error;
      const errorType = classifyUpstreamError(normalizedError);
      const message = getUpstreamErrorMessage(normalizedError);

      activeRequestService.failAttempt({
        requestId,
        providerId: provider.id,
        errorType,
      });
      await recordRequestLogSafe({
        providerId: provider.id,
        requestId,
        modelSlug,
        result: "failure",
        errorType,
        latencyMs: Date.now() - start,
      });
      recordFailure(provider.id, errorType);
      console.warn("[claude] upstream request failed before first byte", {
        providerId: provider.id,
        providerName: provider.name,
        errorType,
        message,
      });

      release();
      const shouldFailover = await applyProviderFailurePolicy({
        breaker: gatewayCircuitBreaker,
        providerId: provider.id,
        modelSlug,
        errorType,
      });
      if (shouldFailover) continue;

      activeRequestService.finishRequest(requestId);
      return buildGatewayErrorResponse(message, 500);
    }
  }

  if (lastFailureResponse) {
    activeRequestService.finishRequest(requestId);
    return new Response(lastFailureResponse.bodyText || null, {
      status: lastFailureResponse.status,
      headers: lastFailureResponse.headers,
    });
  }

  activeRequestService.finishRequest(requestId);
  return buildGatewayErrorResponse("No provider available", 503);
}

claudeRoutes.post("/claude/messages", (c) => handleClaudeMessagesRequest(c));
claudeRoutes.post("/claude/v1/messages", (c) => handleClaudeMessagesRequest(c));
