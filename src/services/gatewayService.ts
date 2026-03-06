import { CircuitBreaker } from "./circuitBreaker";
import { RouterService } from "./routerService";
import {
  callUpstreamNonStreaming,
  callUpstreamStreaming,
  classifyUpstreamError,
  type UpstreamUsage,
} from "./upstreamService";
import type { UpstreamRequestParams } from "./upstreamService";
import { getModelByProviderAndSlug } from "./modelService";
import { deactivateProvider } from "./providerService";
import { billUsage } from "./billingService";
import type { OpenAIChatCompletionResponse } from "../types/openai";
import type { AnthropicMessagesResponse } from "../types/anthropic";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { relayAsAnthropicStream, relayAsOpenAIStream } from "./streamRelay";
import {
  convertUniversalToAnthropicResponse,
  convertUniversalToOpenAIResponse,
} from "./protocolConverter";

export type ClientFormat = "openai" | "anthropic";

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

export type GatewayResponse = {
  status: ContentfulStatusCode;
  body:
    | OpenAIChatCompletionResponse
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

function formatErrorResponse(
  clientFormat: ClientFormat,
  message: string
): OpenAIErrorResponse | AnthropicErrorResponse {
  if (clientFormat === "openai") {
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

  for (const provider of candidates) {
    const model = await getModelByProviderAndSlug(provider.id, modelSlug);
    if (!model) continue;
    try {
      const { result, usage } = await callUpstreamNonStreaming(
        provider,
        model,
        params
      );
      await billUsage(provider.id, modelSlug, usage, model);
      const finishReason =
        typeof result.finishReason === "string" ? result.finishReason : null;
      const universal = buildUniversalResponse(
        modelSlug,
        result.text,
        finishReason,
        usage
      );
      const body =
        clientFormat === "openai"
          ? convertUniversalToOpenAIResponse(universal)
          : convertUniversalToAnthropicResponse(universal);
      return {
        status: 200,
        body,
      };
    } catch (error) {
      const errorType = classifyUpstreamError(error);
      if (errorType === "quota") {
        gatewayCircuitBreaker.open(provider.id, QUOTA_COOLDOWN_MS);
        continue;
      }
      if (errorType === "rate_limit") {
        gatewayCircuitBreaker.open(provider.id, RATE_LIMIT_COOLDOWN_MS);
        continue;
      }
      if (errorType === "auth") {
        await deactivateProvider(provider.id);
        continue;
      }
      if (errorType === "server") {
        gatewayCircuitBreaker.open(provider.id, SERVER_COOLDOWN_MS);
        continue;
      }
      return {
        status: 500,
        body: formatErrorResponse(
          clientFormat,
          error instanceof Error ? error.message : "Upstream error"
        ),
      };
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

  for (const provider of candidates) {
    const model = await getModelByProviderAndSlug(provider.id, modelSlug);
    if (!model) continue;
    try {
      const upstream = await callUpstreamStreaming(provider, model, params);
      void upstream.usagePromise
        .then((usage) => billUsage(provider.id, modelSlug, usage, model))
        .catch(() => undefined);
      const stream =
        clientFormat === "openai"
          ? relayAsOpenAIStream(upstream.stream)
          : relayAsAnthropicStream(upstream.stream);
      return { status: 200, stream };
    } catch (error) {
      const errorType = classifyUpstreamError(error);
      if (errorType === "quota") {
        gatewayCircuitBreaker.open(provider.id, QUOTA_COOLDOWN_MS);
        continue;
      }
      if (errorType === "rate_limit") {
        gatewayCircuitBreaker.open(provider.id, RATE_LIMIT_COOLDOWN_MS);
        continue;
      }
      if (errorType === "auth") {
        await deactivateProvider(provider.id);
        continue;
      }
      if (errorType === "server") {
        gatewayCircuitBreaker.open(provider.id, SERVER_COOLDOWN_MS);
        continue;
      }
      return {
        status: 500,
        body: formatErrorResponse(
          clientFormat,
          error instanceof Error ? error.message : "Upstream error"
        ),
      };
    }
  }

  return {
    status: 503,
    body: formatErrorResponse(clientFormat, "No provider available"),
  };
}
