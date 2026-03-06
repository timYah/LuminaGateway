import type { ProviderV3 } from "@ai-sdk/provider";
import { describe, expect, it, vi } from "vitest";

const createOpenAI = vi.fn(() => ({}) as ProviderV3);
const createAnthropic = vi.fn(() => ({}) as ProviderV3);
const createGoogleGenerativeAI = vi.fn(() => ({}) as ProviderV3);

vi.mock("@ai-sdk/openai", () => ({ createOpenAI }));
vi.mock("@ai-sdk/anthropic", () => ({ createAnthropic }));
vi.mock("@ai-sdk/google", () => ({ createGoogleGenerativeAI }));

import type { Provider } from "../../db/schema/providers";
import { createAIProvider } from "../aiSdkFactory";

describe("createAIProvider", () => {
  it("maps new-api to OpenAI-compatible provider", () => {
    const provider: Provider = {
      id: 1,
      name: "New API Proxy",
      protocol: "new-api",
      baseUrl: "https://newapi.example.com/v1",
      apiKey: "sk-newapi",
      balance: 1,
      isActive: true,
      priority: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    createAIProvider(provider);

    expect(createOpenAI).toHaveBeenCalledWith({
      apiKey: "sk-newapi",
      baseURL: "https://newapi.example.com/v1",
    });
  });
});
