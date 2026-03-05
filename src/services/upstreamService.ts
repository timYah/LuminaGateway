import { generateText } from "ai";
import type { Provider } from "../db/schema/providers";
import type { Model } from "../db/schema/models";
import { createAIProvider } from "./aiSdkFactory";

export type UpstreamRequestParams = Omit<
  Parameters<typeof generateText>[0],
  "model"
>;

type GenerateTextResult = Awaited<ReturnType<typeof generateText>>;

export async function callUpstreamNonStreaming(
  provider: Provider,
  model: Model,
  params: UpstreamRequestParams
): Promise<GenerateTextResult> {
  const aiProvider = createAIProvider(provider);
  const languageModel = aiProvider.languageModel(model.upstreamName);
  const fullParams = {
    ...(params as Record<string, unknown>),
    model: languageModel,
  } as Parameters<typeof generateText>[0];
  return await generateText(fullParams);
}
