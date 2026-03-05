import { CircuitBreaker } from "./circuitBreaker";
import { RouterService } from "./routerService";
import {
  callUpstreamNonStreaming,
  classifyUpstreamError,
  type UpstreamUsage,
} from "./upstreamService";
import type { UpstreamRequestParams } from "./upstreamService";
import { getModelByProviderAndSlug } from "./modelService";
import { deactivateProvider, updateProvider } from "./providerService";
import { billUsage } from "./billingService";
import type { OpenAIChatCompletionResponse } from "../types/openai";
import type { AnthropicMessagesResponse } from "../types/anthropic";

export type ClientFormat = "openai" | "anthropic";

export type GatewayRequestParams = UpstreamRequestParams & {
  model: string;
};

const RATE_LIMIT_COOLDOWN_MS = 60_000;
const SERVER_COOLDOWN_MS = 30_000;

export const gatewayCircuitBreaker = new CircuitBreaker();
export const gatewayRouter = new RouterService(gatewayCircuitBreaker);

function formatOpenAIResponse(
  modelSlug: string,
  text: string,
  finishReason: string | null,
  usage: UpstreamUsage
): OpenAIChatCompletionResponse {
  const created = Math.floor(Date.now() / 1000);
  return {
    id: `chatcmpl_${created}_${Math.random().toString(36).slice(2, 8)}`,
    object: "chat.completion",
    created,
    model: modelSlug,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: text },
        finish_reason: finishReason,
      },
    ],
    usage: {
      prompt_tokens: usage.promptTokens,
      completion_tokens: usage.completionTokens,
      total_tokens: usage.promptTokens + usage.completionTokens,
    },
  };
}

function formatAnthropicResponse(
  modelSlug: string,
  text: string,
  finishReason: string | null,
  usage: UpstreamUsage
): AnthropicMessagesResponse {
  return {
    id: `msg_${Date.now()}`,
    type: "message",
    role: "assistant",
    content: [{ type: "text", text }],
    model: modelSlug,
    stop_reason: finishReason,
    usage: {
      input_tokens: usage.promptTokens,
      output_tokens: usage.completionTokens,
    },
  };
}

export async function handleRequest(
  requestParams: GatewayRequestParams,
  clientFormat: ClientFormat
) {
  const { model: modelSlug, ...params } = requestParams;
  const candidates = await gatewayRouter.getAllCandidates(modelSlug);
  let lastError: unknown = null;

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
      const body =
        clientFormat === "openai"
          ? formatOpenAIResponse(modelSlug, result.text, finishReason, usage)
          : formatAnthropicResponse(modelSlug, result.text, finishReason, usage);
      return {
        status: 200,
        body,
      };
    } catch (error) {
      lastError = error;
      const errorType = classifyUpstreamError(error);
      if (errorType === "quota") {
        await updateProvider(provider.id, { balance: 0 });
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
      throw error;
    }
  }

  if (lastError) {
    throw lastError;
  }
  throw new Error(`No provider available for model: ${modelSlug}`);
}
