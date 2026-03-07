import { APICallError, generateText, streamText } from "ai";
import type { OpenAIProvider } from "@ai-sdk/openai";
import type { Provider } from "../db/schema/providers";
import { createAIProvider } from "./aiSdkFactory";

export type UpstreamRequestParams = Omit<
  Parameters<typeof generateText>[0],
  "model"
>;

type GenerateTextResult = Awaited<ReturnType<typeof generateText>>;
type StreamTextResult = Awaited<ReturnType<typeof streamText>>;

export type UpstreamStreamingResponse = {
  stream: StreamTextResult["fullStream"];
  usagePromise: Promise<UpstreamUsage>;
};

export type UpstreamUsage = {
  promptTokens: number;
  completionTokens: number;
};

export type UpstreamNonStreamingResponse = {
  result: GenerateTextResult;
  usage: UpstreamUsage;
};

type ResolvedModel = {
  languageModel: Parameters<typeof generateText>[0]["model"];
};

function resolveLanguageModel(provider: Provider, modelSlug: string): ResolvedModel {
  const aiProvider = createAIProvider(provider);
  if (provider.protocol === "openai" || provider.protocol === "new-api") {
    const openAIProvider = aiProvider as OpenAIProvider;
    const mode = provider.apiMode ?? "responses";
    const languageModel =
      mode === "chat"
        ? openAIProvider.chat(modelSlug)
        : openAIProvider.responses(modelSlug);
    return { languageModel };
  }
  return { languageModel: aiProvider.languageModel(modelSlug) };
}

function normalizeUsage(usage: GenerateTextResult["usage"]): UpstreamUsage {
  return {
    promptTokens: usage.inputTokens ?? 0,
    completionTokens: usage.outputTokens ?? 0,
  };
}

function shouldFallbackToStreaming(provider: Provider, error: unknown) {
  if (provider.protocol !== "new-api") return false;
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("invalid json response") ||
    message.includes("unexpected response type")
  );
}

async function collectStreamText(stream: UpstreamStreamingResponse["stream"]) {
  let text = "";
  for await (const part of stream) {
    if (part && typeof part === "object" && "type" in part) {
      if (part.type === "text-delta" && "text" in part) {
        text += String(part.text ?? "");
      }
    }
  }
  return text;
}

function buildSyntheticResult(
  text: string,
  usage: UpstreamUsage
): GenerateTextResult {
  const totalTokens = usage.promptTokens + usage.completionTokens;
  return {
    text,
    finishReason: "stop",
    usage: {
      inputTokens: usage.promptTokens,
      outputTokens: usage.completionTokens,
      totalTokens,
    },
  } as GenerateTextResult;
}

export async function callUpstreamNonStreaming(
  provider: Provider,
  modelSlug: string,
  params: UpstreamRequestParams
): Promise<UpstreamNonStreamingResponse> {
  const { languageModel } = resolveLanguageModel(provider, modelSlug);
  const fullParams = {
    ...(params as Record<string, unknown>),
    model: languageModel,
  } as Parameters<typeof generateText>[0];
  try {
    const result = await generateText(fullParams);
    return {
      result,
      usage: normalizeUsage(result.usage),
    };
  } catch (error) {
    if (!shouldFallbackToStreaming(provider, error)) {
      throw error;
    }
    const upstream = callUpstreamStreaming(provider, modelSlug, params);
    const text = await collectStreamText(upstream.stream);
    let usage: UpstreamUsage = { promptTokens: 0, completionTokens: 0 };
    try {
      usage = await upstream.usagePromise;
    } catch {
      // keep zero usage when upstream does not report token usage
    }
    return {
      result: buildSyntheticResult(text, usage),
      usage,
    };
  }
}

export function callUpstreamStreaming(
  provider: Provider,
  modelSlug: string,
  params: UpstreamRequestParams
): UpstreamStreamingResponse {
  const { languageModel } = resolveLanguageModel(provider, modelSlug);
  let resolveUsage!: (usage: UpstreamUsage) => void;
  let rejectUsage!: (error: unknown) => void;
  const usagePromise = new Promise<UpstreamUsage>((resolve, reject) => {
    resolveUsage = resolve;
    rejectUsage = reject;
  });
  // Some callers only observe the stream first and await usage later.
  // Pre-attaching a noop rejection handler prevents process-level crashes.
  void usagePromise.catch(() => {});
  const fullParams = {
    ...(params as Record<string, unknown>),
    model: languageModel,
    onFinish: (event: { totalUsage: GenerateTextResult["usage"] }) => {
      resolveUsage(normalizeUsage(event.totalUsage));
    },
    onError: (error: unknown) => {
      rejectUsage(error);
    },
  } as unknown as Parameters<typeof streamText>[0];
  const streamResult = streamText(fullParams);
  return {
    stream: streamResult.fullStream,
    usagePromise,
  };
}

export type UpstreamErrorType =
  | "quota"
  | "rate_limit"
  | "auth"
  | "server"
  | "network"
  | "model_not_found"
  | "unknown";

const NETWORK_ERROR_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "EPIPE",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_REQUEST_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
]);

export function isNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const anyError = error as { code?: string; cause?: { code?: string } };
  const code = anyError.code || anyError.cause?.code;
  if (code && NETWORK_ERROR_CODES.has(code)) return true;
  const message = error.message?.toLowerCase() ?? "";
  return (
    message.includes("fetch failed") ||
    message.includes("network") ||
    message.includes("socket") ||
    message.includes("timeout") ||
    message.includes("connect")
  );
}

export function classifyUpstreamError(error: unknown): UpstreamErrorType {
  if (isNetworkError(error)) return "network";
  if (APICallError.isInstance(error)) {
    const status = error.statusCode;
    const message = error.message?.toLowerCase() ?? "";
    const modelMissing =
      (status === 400 || status === 404) &&
      message.includes("model") &&
      (message.includes("not found") ||
        message.includes("does not exist") ||
        message.includes("unknown") ||
        message.includes("not supported"));
    if (modelMissing) return "model_not_found";
    if (status === 402) return "quota";
    if (status === 429) return "rate_limit";
    if (status === 401) return "auth";
    if (status === 403) return "auth";
    if (status && status >= 500 && status < 600) return "server";
  }
  return "unknown";
}
