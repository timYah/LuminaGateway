import { APICallError } from "ai";
import { Hono } from "hono";
import type { Provider } from "../db/schema/providers";
import { normalizeOpenAiBaseUrl } from "../services/aiSdkFactory";
import { recordFailure } from "../services/failureStatsService";
import { gatewayCircuitBreaker, gatewayRouter } from "../services/gatewayService";
import { deactivateProvider } from "../services/providerService";
import { createRequestLog } from "../services/requestLogService";
import { classifyUpstreamError, getUpstreamErrorMessage } from "../services/upstreamService";

const RATE_LIMIT_COOLDOWN_MS = 60_000;
const SERVER_COOLDOWN_MS = 30_000;
const QUOTA_COOLDOWN_MS = 300_000;

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

function isCodexPassthroughCandidate(provider: Provider) {
  return (
    (provider.protocol === "openai" || provider.protocol === "new-api") &&
    !provider.codexTransform
  );
}

function buildUpstreamUrl(provider: Provider, requestUrl: string) {
  const upstreamUrl = new URL(`${normalizeOpenAiBaseUrl(provider.baseUrl)}/responses`);
  upstreamUrl.search = new URL(requestUrl).search;
  return upstreamUrl.toString();
}

function buildUpstreamHeaders(source: Headers, apiKey: string) {
  const headers = new Headers();
  source.forEach((value, key) => {
    const normalizedKey = key.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(normalizedKey) || normalizedKey === "authorization") {
      return;
    }
    headers.set(key, value);
  });
  headers.set("authorization", `Bearer ${apiKey}`);
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
    console.error("[codex] request log failed", error);
  }
}

async function applyRetryableFailurePolicy(provider: Provider, errorType: ReturnType<typeof classifyUpstreamError>) {
  switch (errorType) {
    case "quota":
      gatewayCircuitBreaker.open(provider.id, QUOTA_COOLDOWN_MS);
      return true;
    case "rate_limit":
      gatewayCircuitBreaker.open(provider.id, RATE_LIMIT_COOLDOWN_MS);
      return true;
    case "server":
    case "network":
      gatewayCircuitBreaker.open(provider.id, SERVER_COOLDOWN_MS);
      return true;
    case "auth":
      await deactivateProvider(provider.id);
      return true;
    case "model_not_found":
      return true;
    default:
      return false;
  }
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

export const codexRoutes = new Hono();

codexRoutes.post("/codex/responses", async (c) => {
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

  const candidates = (await gatewayRouter.getAllCandidates(modelSlug)).filter(
    isCodexPassthroughCandidate
  );
  if (candidates.length === 0) {
    return buildGatewayErrorResponse("No provider available", 503);
  }

  let lastFailureResponse: StoredFailureResponse | null = null;

  for (const provider of candidates) {
    const start = Date.now();
    const upstreamUrl = buildUpstreamUrl(provider, c.req.url);
    try {
      const upstreamResponse = await fetch(upstreamUrl, {
        method: c.req.method,
        headers: buildUpstreamHeaders(c.req.raw.headers, provider.apiKey),
        body: rawBody,
      });

      if (upstreamResponse.ok) {
        await recordRequestLogSafe({
          providerId: provider.id,
          modelSlug,
          result: "success",
          latencyMs: Date.now() - start,
        });
        return new Response(upstreamResponse.body, {
          status: upstreamResponse.status,
          headers: filterResponseHeaders(upstreamResponse.headers),
        });
      }

      const responseBody = await upstreamResponse.text();
      const error = buildApiCallError(upstreamResponse, upstreamUrl, parsedBody, responseBody);
      const errorType = classifyUpstreamError(error);
      const message = getUpstreamErrorMessage(error);

      await recordRequestLogSafe({
        providerId: provider.id,
        modelSlug,
        result: "failure",
        errorType,
        latencyMs: Date.now() - start,
      });
      recordFailure(provider.id, errorType);
      console.warn("[codex] upstream response failed before first byte", {
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

      const shouldFailover = await applyRetryableFailurePolicy(provider, errorType);
      if (shouldFailover) continue;

      return new Response(responseBody || null, {
        status: upstreamResponse.status,
        headers: lastFailureResponse.headers,
      });
    } catch (error) {
      const errorType = classifyUpstreamError(error);
      const message = getUpstreamErrorMessage(error);

      await recordRequestLogSafe({
        providerId: provider.id,
        modelSlug,
        result: "failure",
        errorType,
        latencyMs: Date.now() - start,
      });
      recordFailure(provider.id, errorType);
      console.warn("[codex] upstream request failed before first byte", {
        providerId: provider.id,
        providerName: provider.name,
        errorType,
        message,
      });

      const shouldFailover = await applyRetryableFailurePolicy(provider, errorType);
      if (shouldFailover) continue;

      return buildGatewayErrorResponse(message, 500);
    }
  }

  if (lastFailureResponse) {
    return new Response(lastFailureResponse.bodyText || null, {
      status: lastFailureResponse.status,
      headers: lastFailureResponse.headers,
    });
  }

  return buildGatewayErrorResponse("No provider available", 503);
});
