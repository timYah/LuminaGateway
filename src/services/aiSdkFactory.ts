import type { ProviderV3 } from "@ai-sdk/provider";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { Provider } from "../db/schema/providers";

export function createAIProvider(provider: Provider): ProviderV3 {
  switch (provider.protocol) {
    case "openai":
    case "new-api":
      return createOpenAI({
        apiKey: provider.apiKey,
        baseURL: provider.baseUrl,
      });
    case "anthropic":
      return createAnthropic({
        apiKey: provider.apiKey,
        baseURL: provider.baseUrl,
      });
    case "google":
      return createGoogleGenerativeAI({
        apiKey: provider.apiKey,
        baseURL: provider.baseUrl,
      });
    default:
      throw new Error(`Unsupported provider protocol: ${provider.protocol}`);
  }
}
