import { APICallError, generateText, streamText } from "ai";
import type { OpenAIProvider } from "@ai-sdk/openai";
import type { Provider } from "../db/schema/providers";
import { createAIProvider } from "./aiSdkFactory";
import { normalizeOpenAiCompatibleModelSlug } from "./modelSlug";

export type UpstreamRequestParams = Omit<
  Parameters<typeof generateText>[0],
  "model"
>;

type GenerateTextResult = Awaited<ReturnType<typeof generateText>>;
type StreamTextResult = Awaited<ReturnType<typeof streamText>>;
type ApiCallErrorLike = APICallError & {
  responseBody?: string;
  data?: unknown;
};

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

const MODEL_NOT_FOUND_PATTERNS = [
  "model not found",
  "does not exist",
  "unknown model",
  "model unavailable",
  "not supported",
  "unsupported model",
  "invalid model",
  "unrecognized model",
  "未配置模型",
  "模型未配置",
  "模型不存在",
  "模型不可用",
  "不支持模型",
];

function resolveLanguageModel(provider: Provider, modelSlug: string): ResolvedModel {
  const resolvedModelSlug = normalizeOpenAiCompatibleModelSlug(modelSlug);
  const aiProvider = createAIProvider(provider);
  if (provider.protocol === "openai" || provider.protocol === "new-api") {
    const openAIProvider = aiProvider as OpenAIProvider;
    const mode = provider.apiMode ?? "responses";
    const languageModel =
      mode === "chat"
        ? openAIProvider.chat(resolvedModelSlug)
        : openAIProvider.responses(resolvedModelSlug);
    return { languageModel };
  }
  return { languageModel: aiProvider.languageModel(resolvedModelSlug) };
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

function unwrapStreamError(error: unknown) {
  if (error && typeof error === "object" && "error" in error) {
    return (error as { error: unknown }).error;
  }
  return error;
}

function parseJsonText(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function collectErrorTextFragments(value: unknown, depth = 0): string[] {
  if (depth > 3 || value == null) return [];
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectErrorTextFragments(item, depth + 1));
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const priorityKeys = ["error", "message", "detail", "details", "msg", "type"];
    const seen = new Set<string>();
    const fragments: string[] = [];

    for (const key of priorityKeys) {
      if (key in record) {
        seen.add(key);
        fragments.push(...collectErrorTextFragments(record[key], depth + 1));
      }
    }

    for (const [key, item] of Object.entries(record)) {
      if (seen.has(key)) continue;
      fragments.push(...collectErrorTextFragments(item, depth + 1));
    }

    return fragments;
  }
  return [];
}

function collectApiCallErrorText(error: ApiCallErrorLike) {
  const fragments = new Set<string>();
  const add = (value: unknown) => {
    for (const fragment of collectErrorTextFragments(value)) {
      fragments.add(fragment);
    }
  };

  add(error.data);
  if (typeof error.responseBody === "string" && error.responseBody.trim()) {
    add(parseJsonText(error.responseBody));
  }

  return [...fragments];
}

export function getUpstreamErrorMessage(error: unknown): string {
  if (APICallError.isInstance(error)) {
    const apiError = error as ApiCallErrorLike;
    const detailedMessage = collectApiCallErrorText(apiError)[0];
    if (detailedMessage) return detailedMessage;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown error";
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
      rejectUsage(unwrapStreamError(error));
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
    const apiError = error as ApiCallErrorLike;
    const status = apiError.statusCode;
    const combinedText = [apiError.message, ...collectApiCallErrorText(apiError)]
      .join(" ")
      .toLowerCase();
    const modelMissing =
      (status === 400 || status === 404) &&
      MODEL_NOT_FOUND_PATTERNS.some((pattern) => combinedText.includes(pattern));

    if (modelMissing) return "model_not_found";
    if (status === 402) return "quota";
    if (status === 429) return "rate_limit";
    if (status === 401) return "auth";
    if (status === 403) return "auth";
    if (status && status >= 500 && status < 600) return "server";
  }
  return "unknown";
}
