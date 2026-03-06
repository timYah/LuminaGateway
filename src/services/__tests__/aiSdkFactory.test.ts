import { describe, expect, it, vi } from "vitest";

vi.mock("@ai-sdk/openai", () => ({ createOpenAI: vi.fn() }));
vi.mock("@ai-sdk/anthropic", () => ({ createAnthropic: vi.fn() }));
vi.mock("@ai-sdk/google", () => ({ createGoogleGenerativeAI: vi.fn() }));

import { createOpenAI } from "@ai-sdk/openai";
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
      inputPrice: null,
      outputPrice: null,
      isActive: true,
      priority: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    createAIProvider(provider);

    expect(vi.mocked(createOpenAI)).toHaveBeenCalledWith({
      apiKey: "sk-newapi",
      baseURL: "https://newapi.example.com/v1",
    });
  });
});
