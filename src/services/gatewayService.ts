import { CircuitBreaker } from "./circuitBreaker";
import { RouterService } from "./routerService";
import {
  callUpstreamNonStreaming,
  callUpstreamStreaming,
  classifyUpstreamError,
  isNetworkError,
  type UpstreamUsage,
} from "./upstreamService";
import type { UpstreamRequestParams } from "./upstreamService";
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

type GatewayErrorResponse = {
  status: ContentfulStatusCode;
  body: OpenAIErrorResponse | AnthropicErrorResponse;
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

async function handleUpstreamError(
  error: unknown,
  providerId: number,
  clientFormat: ClientFormat
): Promise<"continue" | GatewayErrorResponse> {
  const errorType = classifyUpstreamError(error);
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
  if (errorType === "server") {
    if (isNetworkError(error)) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.warn("[gateway] upstream network error; failing over", {
        providerId,
        message,
      });
    }
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
    try {
      const { result, usage } = await callUpstreamNonStreaming(
        provider,
        modelSlug,
        params
      );
      await billUsage(provider, modelSlug, usage);
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
      const result = await handleUpstreamError(error, provider.id, clientFormat);
      if (result === "continue") continue;
      return result;
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
    try {
      const upstream = await callUpstreamStreaming(provider, modelSlug, params);
      void upstream.usagePromise
        .then((usage) => billUsage(provider, modelSlug, usage))
        .catch((err) => console.error("Billing failed", err));
      const stream =
        clientFormat === "openai"
          ? relayAsOpenAIStream(upstream.stream, modelSlug)
          : relayAsAnthropicStream(upstream.stream);
      return { status: 200, stream };
    } catch (error) {
      const result = await handleUpstreamError(error, provider.id, clientFormat);
      if (result === "continue") continue;
      return result;
    }
  }

  return {
    status: 503,
    body: formatErrorResponse(clientFormat, "No provider available"),
  };
}
