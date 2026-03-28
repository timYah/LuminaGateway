import { CircuitBreaker } from "./circuitBreaker";
import { RouterService } from "./routerService";
import {
  callUpstreamNonStreaming,
  callUpstreamStreaming,
  classifyUpstreamError,
  type UpstreamErrorType,
  type UpstreamStreamingResponse,
  type UpstreamUsage,
} from "./upstreamService";
import type { UpstreamRequestParams } from "./upstreamService";
import { billUsage } from "./billingService";
import { recordFailure } from "./failureStatsService";
import { createRequestLog } from "./requestLogService";
import { activeRequestService } from "./activeRequestService";
import { gatewayInflightLimiter } from "./inflightService";
import { applyProviderFailurePolicy } from "./providerFailurePolicy";
import type {
  OpenAIChatCompletionResponse,
  OpenAIResponsesResponse,
} from "../types/openai";
import type { AnthropicMessagesResponse } from "../types/anthropic";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import {
  relayAsAnthropicStream,
  relayAsOpenAIResponsesStream,
  relayAsOpenAIStream,
} from "./streamRelay";
import { wrapStreamWithFinalizer } from "./streamUtils";
import {
  convertUniversalToAnthropicResponse,
  convertUniversalToOpenAIResponse,
  convertUniversalToOpenAIResponsesResponse,
} from "./protocolConverter";
import { normalizeOpenAiCompatibleModelSlug } from "./modelSlug";

export type ClientFormat = "openai" | "openai-responses" | "anthropic" | "gemini";

export type GatewayRequestParams = UpstreamRequestParams & {
  model: string;
};

type GatewayRequestContext = {
  requestId?: string | null;
  routePath?: string | null;
};

type OpenAIErrorResponse = {
  error: { message: string; type: string; code: string };
};

type AnthropicErrorResponse = {
  type: "error";
  error: { type: string; message: string };
};

type GatewayErrorResponse = {
  status: ContentfulStatusCode;
  body: OpenAIErrorResponse | AnthropicErrorResponse;
};

export type GatewayResponse = {
  status: ContentfulStatusCode;
  body:
    | OpenAIChatCompletionResponse
    | OpenAIResponsesResponse
    | AnthropicMessagesResponse
    | OpenAIErrorResponse
    | AnthropicErrorResponse;
};

export type GatewayStreamingResponse =
  | { status: ContentfulStatusCode; stream: ReadableStream<Uint8Array> }
  | { status: ContentfulStatusCode; body: OpenAIErrorResponse | AnthropicErrorResponse };

const DEFAULT_RETRY_BASE_MS = 200;

function parseRetryValue(value: string | undefined) {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.floor(parsed));
}

function resolveRetryConfig() {
  const attempts = parseRetryValue(process.env.UPSTREAM_RETRY_ATTEMPTS) ?? 0;
  const baseMs = parseRetryValue(process.env.UPSTREAM_RETRY_BASE_MS) ?? DEFAULT_RETRY_BASE_MS;
  return { attempts, baseMs };
}

function isRetryableErrorType(errorType: UpstreamErrorType) {
  return errorType === "network" || errorType === "server";
}

async function sleep(ms: number) {
  if (ms <= 0) return;
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function callWithRetries<T>(
  fn: () => Promise<T> | T,
  attempts: number,
  baseMs: number
) {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (error) {
      const errorType = classifyUpstreamError(error);
      if (!isRetryableErrorType(errorType) || attempt >= attempts) {
        throw error;
      }
      const delayMs = baseMs * Math.pow(2, attempt);
      attempt += 1;
      await sleep(delayMs);
    }
  }
}

export const gatewayCircuitBreaker = new CircuitBreaker();
export const gatewayRouter = new RouterService(gatewayCircuitBreaker);

function buildUniversalResponse(
  modelSlug: string,
  text: string,
  finishReason: string | null,
  usage: UpstreamUsage
) {
  return { model: modelSlug, text, finishReason, usage };
}

function isAnthropicFormat(clientFormat: ClientFormat) {
  return clientFormat === "anthropic";
}

function formatErrorResponse(
  clientFormat: ClientFormat,
  message: string
): OpenAIErrorResponse | AnthropicErrorResponse {
  if (!isAnthropicFormat(clientFormat)) {
    const body: OpenAIErrorResponse = {
      error: { message, type: "gateway_error", code: "gateway_error" },
    };
    return body;
  }
  const body: AnthropicErrorResponse = {
    type: "error",
    error: { type: "gateway_error", message },
  };
  return body;
}

async function recordRequestLogSafe(input: Parameters<typeof createRequestLog>[0]) {
  try {
    await createRequestLog(input);
  } catch (error) {
    console.error("[gateway] request log failed", error);
  }
}

async function handleUpstreamError(
  error: unknown,
  providerId: number,
  modelSlug: string,
  clientFormat: ClientFormat,
  errorTypeOverride?: UpstreamErrorType
): Promise<"continue" | GatewayErrorResponse> {
  const errorType = errorTypeOverride ?? classifyUpstreamError(error);
  recordFailure(providerId, errorType);
  if (errorType === "network") {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.warn("[gateway] upstream network error; failing over", {
      providerId,
      message,
    });
  }
  const shouldFailover = await applyProviderFailurePolicy({
    breaker: gatewayCircuitBreaker,
    providerId,
    modelSlug,
    errorType,
  });
  if (shouldFailover) {
    return "continue";
  }
  return {
    status: 500,
    body: formatErrorResponse(
      clientFormat,
      error instanceof Error ? error.message : "Upstream error"
    ),
  };
}

function formatSuccessResponseBody(
  clientFormat: ClientFormat,
  universal: ReturnType<typeof buildUniversalResponse>
) {
  if (clientFormat === "anthropic") {
    return convertUniversalToAnthropicResponse(universal);
  }
  if (clientFormat === "openai-responses") {
    return convertUniversalToOpenAIResponsesResponse(universal);
  }
  return convertUniversalToOpenAIResponse(universal);
}

export async function handleRequest(
  requestParams: GatewayRequestParams,
  clientFormat: ClientFormat,
  requestContext: GatewayRequestContext = {}
): Promise<GatewayResponse> {
  const modelSlug = normalizeOpenAiCompatibleModelSlug(requestParams.model);
  const params = requestParams as UpstreamRequestParams;
  const candidates = await gatewayRouter.getAllCandidates(modelSlug);
  if (candidates.length === 0) {
    return {
      status: 503,
      body: formatErrorResponse(clientFormat, "No provider available"),
    };
  }

  const retryConfig = resolveRetryConfig();

  for (const provider of candidates) {
    if (!gatewayInflightLimiter.tryAcquire(provider.id, provider.name)) {
      continue;
    }
    if (requestContext.requestId) {
      activeRequestService.startAttempt({
        requestId: requestContext.requestId,
        providerId: provider.id,
        providerName: provider.name,
      });
    }
    const start = Date.now();
    try {
      const { result, usage } = await callWithRetries(
        () => callUpstreamNonStreaming(provider, modelSlug, params),
        retryConfig.attempts,
        retryConfig.baseMs
      );
      await billUsage(provider, modelSlug, usage, {
        requestId: requestContext.requestId,
        routePath: requestContext.routePath,
      });
      await recordRequestLogSafe({
        providerId: provider.id,
        requestId: requestContext.requestId,
        modelSlug,
        result: "success",
        latencyMs: Date.now() - start,
      });
      const finishReason =
        typeof result.finishReason === "string" ? result.finishReason : null;
      const universal = buildUniversalResponse(
        modelSlug,
        result.text,
        finishReason,
        usage
      );
      return {
        status: 200,
        body: formatSuccessResponseBody(clientFormat, universal),
      };
    } catch (error) {
      const errorType = classifyUpstreamError(error);
      if (requestContext.requestId) {
        activeRequestService.failAttempt({
          requestId: requestContext.requestId,
          providerId: provider.id,
          errorType,
        });
      }
      await recordRequestLogSafe({
        providerId: provider.id,
        requestId: requestContext.requestId,
        modelSlug,
        result: "failure",
        errorType,
        latencyMs: Date.now() - start,
      });
      const result = await handleUpstreamError(
        error,
        provider.id,
        modelSlug,
        clientFormat,
        errorType
      );
      if (result === "continue") continue;
      return result;
    } finally {
      gatewayInflightLimiter.release(provider.id);
    }
  }

  return {
    status: 503,
    body: formatErrorResponse(clientFormat, "No provider available"),
  };
}

export async function handleStreamingRequest(
  requestParams: GatewayRequestParams,
  clientFormat: ClientFormat,
  requestContext: GatewayRequestContext = {}
): Promise<GatewayStreamingResponse> {
  const modelSlug = normalizeOpenAiCompatibleModelSlug(requestParams.model);
  const params = requestParams as UpstreamRequestParams;
  const candidates = await gatewayRouter.getAllCandidates(modelSlug);
  if (candidates.length === 0) {
    return {
      status: 503,
      body: formatErrorResponse(clientFormat, "No provider available"),
    };
  }

  const retryConfig = resolveRetryConfig();

  for (const provider of candidates) {
    if (!gatewayInflightLimiter.tryAcquire(provider.id, provider.name)) {
      continue;
    }
    if (requestContext.requestId) {
      activeRequestService.startAttempt({
        requestId: requestContext.requestId,
        providerId: provider.id,
        providerName: provider.name,
      });
    }
    const start = Date.now();
    const release = () => gatewayInflightLimiter.release(provider.id);
    try {
      const upstream = await callWithRetries<UpstreamStreamingResponse>(
        () => callUpstreamStreaming(provider, modelSlug, params),
        retryConfig.attempts,
        retryConfig.baseMs
      );
      void upstream.usagePromise
        .then(async (usage: UpstreamUsage) => {
          await recordRequestLogSafe({
            providerId: provider.id,
            requestId: requestContext.requestId,
            modelSlug,
            result: "success",
            latencyMs: Date.now() - start,
          });
          try {
            await billUsage(provider, modelSlug, usage, {
              requestId: requestContext.requestId,
              routePath: requestContext.routePath,
            });
          } catch (err: unknown) {
            console.error("Billing failed", err);
          }
        })
        .catch(async (err: unknown) => {
          const errorType = classifyUpstreamError(err);
          if (requestContext.requestId) {
            activeRequestService.failAttempt({
              requestId: requestContext.requestId,
              providerId: provider.id,
              errorType,
            });
          }
          recordFailure(provider.id, errorType);
          await recordRequestLogSafe({
            providerId: provider.id,
            requestId: requestContext.requestId,
            modelSlug,
            result: "failure",
            errorType,
            latencyMs: Date.now() - start,
          });
          await applyProviderFailurePolicy({
            breaker: gatewayCircuitBreaker,
            providerId: provider.id,
            modelSlug,
            errorType,
          });
          console.error("Streaming failed", err);
        });
      const stream =
        clientFormat === "anthropic"
          ? relayAsAnthropicStream(upstream.stream)
          : clientFormat === "openai-responses"
            ? relayAsOpenAIResponsesStream(
                upstream.stream,
                modelSlug,
                upstream.usagePromise,
                params.tools
              )
            : relayAsOpenAIStream(upstream.stream, modelSlug);
      return {
        status: 200,
        stream: wrapStreamWithFinalizer(stream, {
          onFinalize: () => {
            release();
            if (requestContext.requestId) {
              activeRequestService.finishRequest(requestContext.requestId);
            }
          },
        }),
      };
    } catch (error) {
      release();
      const errorType = classifyUpstreamError(error);
      if (requestContext.requestId) {
        activeRequestService.failAttempt({
          requestId: requestContext.requestId,
          providerId: provider.id,
          errorType,
        });
      }
      await recordRequestLogSafe({
        providerId: provider.id,
        requestId: requestContext.requestId,
        modelSlug,
        result: "failure",
        errorType,
        latencyMs: Date.now() - start,
      });
      const result = await handleUpstreamError(
        error,
        provider.id,
        modelSlug,
        clientFormat,
        errorType
      );
      if (result === "continue") continue;
      return result;
    }
  }

  return {
    status: 503,
    body: formatErrorResponse(clientFormat, "No provider available"),
  };
}
