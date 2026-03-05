import { beforeEach, describe, expect, it, vi } from "vitest";
import { APICallError, generateText } from "ai";
import type { ProviderV3 } from "@ai-sdk/provider";
import { callUpstreamNonStreaming, classifyUpstreamError } from "../upstreamService";

vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");
  return {
    ...actual,
    generateText: vi.fn(),
  };
});

const createAIProvider = vi.fn();
vi.mock("../aiSdkFactory", () => ({
  createAIProvider: (provider: unknown) => createAIProvider(provider),
}));

const generateTextMock = vi.mocked(generateText);

type GenerateTextResult = Awaited<ReturnType<typeof generateText>>;

const baseProvider = {
  id: 1,
  name: "Test Provider",
  protocol: "openai" as const,
  baseUrl: "https://example.com",
  apiKey: "sk-test",
  balance: 10,
  isActive: true,
  priority: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const baseModel = {
  id: 1,
  providerId: 1,
  slug: "gpt-4o",
  upstreamName: "gpt-4o",
  inputPrice: 1,
  outputPrice: 2,
};

describe("upstreamService", () => {
  beforeEach(() => {
    generateTextMock.mockReset();
    createAIProvider.mockReset();
  });

  it("callUpstreamNonStreaming returns usage and result", async () => {
    const languageModel = { id: "mock-model" };
    const mockProvider = {
      languageModel: vi.fn().mockReturnValue(languageModel),
      specificationVersion: "v3",
    } as unknown as ProviderV3;
    createAIProvider.mockReturnValue(mockProvider);

    const usage = {
      inputTokens: 12,
      outputTokens: 34,
      inputTokenDetails: {
        noCacheTokens: undefined,
        cacheReadTokens: undefined,
        cacheWriteTokens: undefined,
      },
      outputTokenDetails: {
        textTokens: undefined,
        reasoningTokens: undefined,
      },
      totalTokens: 46,
    };

    const fakeResult = {
      usage,
    } as GenerateTextResult;

    generateTextMock.mockResolvedValue(fakeResult);

    const response = await callUpstreamNonStreaming(baseProvider, baseModel, {
      messages: [],
    });

    expect(createAIProvider).toHaveBeenCalledWith(baseProvider);
    expect(mockProvider.languageModel).toHaveBeenCalledWith(baseModel.upstreamName);
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: languageModel, messages: [] })
    );
    expect(response.usage).toEqual({
      promptTokens: 12,
      completionTokens: 34,
    });
    expect(response.result).toBe(fakeResult);
  });

  it("classifyUpstreamError maps status codes", () => {
    const quota = new APICallError({
      message: "quota",
      url: "http://example.com",
      requestBodyValues: {},
      statusCode: 402,
    });
    const rate = new APICallError({
      message: "rate",
      url: "http://example.com",
      requestBodyValues: {},
      statusCode: 429,
    });
    const auth = new APICallError({
      message: "auth",
      url: "http://example.com",
      requestBodyValues: {},
      statusCode: 401,
    });
    const server = new APICallError({
      message: "server",
      url: "http://example.com",
      requestBodyValues: {},
      statusCode: 503,
    });

    expect(classifyUpstreamError(quota)).toBe("quota");
    expect(classifyUpstreamError(rate)).toBe("rate_limit");
    expect(classifyUpstreamError(auth)).toBe("auth");
    expect(classifyUpstreamError(server)).toBe("server");
    expect(classifyUpstreamError(new Error("other"))).toBe("unknown");
  });
});
