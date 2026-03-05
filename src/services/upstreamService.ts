import { generateText } from "ai";
import type { Provider } from "../db/schema/providers";
import type { Model } from "../db/schema/models";
import { createAIProvider } from "./aiSdkFactory";

export type UpstreamRequestParams = Omit<
  Parameters<typeof generateText>[0],
  "model"
>;

type GenerateTextResult = Awaited<ReturnType<typeof generateText>>;

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
  model: Model,
  params: UpstreamRequestParams
): Promise<UpstreamNonStreamingResponse> {
  const aiProvider = createAIProvider(provider);
  const languageModel = aiProvider.languageModel(model.upstreamName);
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
