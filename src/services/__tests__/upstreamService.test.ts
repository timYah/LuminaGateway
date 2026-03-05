import { beforeEach, describe, expect, it, vi } from "vitest";
import { APICallError, generateText, streamText } from "ai";
import type { ProviderV3 } from "@ai-sdk/provider";
import {
  callUpstreamNonStreaming,
  callUpstreamStreaming,
  classifyUpstreamError,
} from "../upstreamService";

vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");
  return {
    ...actual,
    generateText: vi.fn(),
    streamText: vi.fn(),
  };
});

const createAIProvider = vi.fn();
vi.mock("../aiSdkFactory", () => ({
  createAIProvider: (provider: unknown) => createAIProvider(provider),
}));

const generateTextMock = vi.mocked(generateText);
const streamTextMock = vi.mocked(streamText);

type GenerateTextResult = Awaited<ReturnType<typeof generateText>>;
type StreamTextResult = Awaited<ReturnType<typeof streamText>>;

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
    streamTextMock.mockReset();
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

  it("callUpstreamStreaming returns stream and usagePromise", async () => {
    const languageModel = { id: "mock-model" };
    const mockProvider = {
      languageModel: vi.fn().mockReturnValue(languageModel),
      specificationVersion: "v3",
    } as unknown as ProviderV3;
    createAIProvider.mockReturnValue(mockProvider);

    const usage = {
      inputTokens: 5,
      outputTokens: 7,
      inputTokenDetails: {
        noCacheTokens: undefined,
        cacheReadTokens: undefined,
        cacheWriteTokens: undefined,
      },
      outputTokenDetails: {
        textTokens: undefined,
        reasoningTokens: undefined,
      },
      totalTokens: 12,
    };

    const fakeStream = (async function* () {
      yield { type: "text-delta", id: "1", text: "hello" };
      yield { type: "text-delta", id: "1", text: " world" };
    })();

    streamTextMock.mockImplementation((options) => {
      options.onFinish?.({ totalUsage: usage } as unknown as Parameters<
        NonNullable<typeof options.onFinish>
      >[0]);
      return { fullStream: fakeStream } as unknown as StreamTextResult;
    });

    const response = callUpstreamStreaming(baseProvider, baseModel, {
      messages: [],
    });

    const chunks: unknown[] = [];
    for await (const chunk of response.stream) {
      chunks.push(chunk);
    }

    expect(createAIProvider).toHaveBeenCalledWith(baseProvider);
    expect(mockProvider.languageModel).toHaveBeenCalledWith(baseModel.upstreamName);
    expect(streamTextMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: languageModel, messages: [] })
    );
    expect(chunks).toHaveLength(2);
    await expect(response.usagePromise).resolves.toEqual({
      promptTokens: 5,
      completionTokens: 7,
    });
  });
});
