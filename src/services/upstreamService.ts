import { APICallError, generateText, streamText } from "ai";
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

function normalizeUsage(usage: GenerateTextResult["usage"]): UpstreamUsage {
  return {
    promptTokens: usage.inputTokens ?? 0,
    completionTokens: usage.outputTokens ?? 0,
  };
}

export async function callUpstreamNonStreaming(
  provider: Provider,
  modelSlug: string,
  params: UpstreamRequestParams
): Promise<UpstreamNonStreamingResponse> {
  const aiProvider = createAIProvider(provider);
  const languageModel = aiProvider.languageModel(modelSlug);
  const fullParams = {
    ...(params as Record<string, unknown>),
    model: languageModel,
  } as Parameters<typeof generateText>[0];
  const result = await generateText(fullParams);
  return {
    result,
    usage: normalizeUsage(result.usage),
  };
}

export function callUpstreamStreaming(
  provider: Provider,
  modelSlug: string,
  params: UpstreamRequestParams
): UpstreamStreamingResponse {
  const aiProvider = createAIProvider(provider);
  const languageModel = aiProvider.languageModel(modelSlug);
  let resolveUsage!: (usage: UpstreamUsage) => void;
  let rejectUsage!: (error: unknown) => void;
  const usagePromise = new Promise<UpstreamUsage>((resolve, reject) => {
    resolveUsage = resolve;
    rejectUsage = reject;
  });
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
  | "model_not_found"
  | "unknown";

export function classifyUpstreamError(error: unknown): UpstreamErrorType {
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
