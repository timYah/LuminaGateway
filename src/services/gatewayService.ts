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
import { deactivateProvider } from "./providerService";
import { billUsage } from "./billingService";
import { recordFailure } from "./failureStatsService";
import { createRequestLog } from "./requestLogService";
import { gatewayInflightLimiter } from "./inflightService";
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

export type ClientFormat = "openai" | "openai-responses" | "anthropic";

export type GatewayRequestParams = UpstreamRequestParams & {
  model: string;
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

const RATE_LIMIT_COOLDOWN_MS = 60_000;
const SERVER_COOLDOWN_MS = 30_000;
const QUOTA_COOLDOWN_MS = 300_000;
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
  clientFormat: ClientFormat,
  errorTypeOverride?: UpstreamErrorType
): Promise<"continue" | GatewayErrorResponse> {
  const errorType = errorTypeOverride ?? classifyUpstreamError(error);
  recordFailure(providerId, errorType);
  if (errorType === "quota") {
    gatewayCircuitBreaker.open(providerId, QUOTA_COOLDOWN_MS);
    return "continue";
  }
  if (errorType === "model_not_found") {
    return "continue";
  }
  if (errorType === "rate_limit") {
    gatewayCircuitBreaker.open(providerId, RATE_LIMIT_COOLDOWN_MS);
    return "continue";
  }
  if (errorType === "auth") {
    await deactivateProvider(providerId);
    return "continue";
  }
  if (errorType === "network") {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.warn("[gateway] upstream network error; failing over", {
      providerId,
      message,
    });
    gatewayCircuitBreaker.open(providerId, SERVER_COOLDOWN_MS);
    return "continue";
  }
  if (errorType === "server") {
    gatewayCircuitBreaker.open(providerId, SERVER_COOLDOWN_MS);
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
  clientFormat: ClientFormat
): Promise<GatewayResponse> {
  const { model: modelSlug, ...params } = requestParams;
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
    const start = Date.now();
    try {
      const { result, usage } = await callWithRetries(
        () => callUpstreamNonStreaming(provider, modelSlug, params),
        retryConfig.attempts,
        retryConfig.baseMs
      );
      await billUsage(provider, modelSlug, usage);
      await recordRequestLogSafe({
        providerId: provider.id,
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
      await recordRequestLogSafe({
        providerId: provider.id,
        modelSlug,
        result: "failure",
        errorType,
        latencyMs: Date.now() - start,
      });
      const result = await handleUpstreamError(
        error,
        provider.id,
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
  clientFormat: ClientFormat
): Promise<GatewayStreamingResponse> {
  const { model: modelSlug, ...params } = requestParams;
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
            modelSlug,
            result: "success",
            latencyMs: Date.now() - start,
          });
          try {
            await billUsage(provider, modelSlug, usage);
          } catch (err: unknown) {
            console.error("Billing failed", err);
          }
        })
        .catch(async (err: unknown) => {
          const errorType = classifyUpstreamError(err);
          recordFailure(provider.id, errorType);
          await recordRequestLogSafe({
            providerId: provider.id,
            modelSlug,
            result: "failure",
            errorType,
            latencyMs: Date.now() - start,
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
        stream: wrapStreamWithFinalizer(stream, release),
      };
    } catch (error) {
      release();
      const errorType = classifyUpstreamError(error);
      await recordRequestLogSafe({
        providerId: provider.id,
        modelSlug,
        result: "failure",
        errorType,
        latencyMs: Date.now() - start,
      });
      const result = await handleUpstreamError(
        error,
        provider.id,
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
