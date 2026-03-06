import { beforeEach, describe, expect, it, vi } from "vitest";
import { APICallError, generateText, streamText } from "ai";
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
  apiMode: "responses" as const,
  balance: 10,
  inputPrice: null,
  outputPrice: null,
  isActive: true,
  priority: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const modelSlug = "gpt-4o";

describe("upstreamService", () => {
  beforeEach(() => {
    generateTextMock.mockReset();
    streamTextMock.mockReset();
    createAIProvider.mockReset();
  });

  it("callUpstreamNonStreaming returns usage and result", async () => {
    const languageModel = { id: "mock-model" };
    const mockProvider = {
      responses: vi.fn().mockReturnValue(languageModel),
      chat: vi.fn(),
      specificationVersion: "v3",
    };
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

    const response = await callUpstreamNonStreaming(baseProvider, modelSlug, {
      messages: [],
    });

    expect(createAIProvider).toHaveBeenCalledWith(baseProvider);
    expect(mockProvider.responses).toHaveBeenCalledWith(modelSlug);
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
    const modelMissing = new APICallError({
      message: "Model not found",
      url: "http://example.com",
      requestBodyValues: {},
      statusCode: 404,
    });

    expect(classifyUpstreamError(quota)).toBe("quota");
    expect(classifyUpstreamError(rate)).toBe("rate_limit");
    expect(classifyUpstreamError(auth)).toBe("auth");
    expect(classifyUpstreamError(server)).toBe("server");
    expect(classifyUpstreamError(modelMissing)).toBe("model_not_found");
    expect(classifyUpstreamError(new Error("other"))).toBe("unknown");
  });

  it("callUpstreamStreaming returns stream and usagePromise", async () => {
    const languageModel = { id: "mock-model" };
    const mockProvider = {
      responses: vi.fn().mockReturnValue(languageModel),
      chat: vi.fn(),
      specificationVersion: "v3",
    };
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

    const response = callUpstreamStreaming(baseProvider, modelSlug, {
      messages: [],
    });

    const chunks: unknown[] = [];
    for await (const chunk of response.stream) {
      chunks.push(chunk);
    }

    expect(createAIProvider).toHaveBeenCalledWith(baseProvider);
    expect(mockProvider.responses).toHaveBeenCalledWith(modelSlug);
    expect(streamTextMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: languageModel, messages: [] })
    );
    expect(chunks).toHaveLength(2);
    await expect(response.usagePromise).resolves.toEqual({
      promptTokens: 5,
      completionTokens: 7,
    });
  });

  it("uses chat mode for openai when apiMode=chat", async () => {
    const chatProvider = { ...baseProvider, apiMode: "chat" as const };
    const chatModel = { id: "mock-chat" };
    const mockProvider = {
      responses: vi.fn(),
      chat: vi.fn().mockReturnValue(chatModel),
      specificationVersion: "v3",
    };
    createAIProvider.mockReturnValue(mockProvider);

    const fakeResult = { usage: { inputTokens: 1, outputTokens: 1 } } as GenerateTextResult;
    generateTextMock.mockResolvedValue(fakeResult);

    await callUpstreamNonStreaming(chatProvider, modelSlug, { messages: [] });

    expect(mockProvider.chat).toHaveBeenCalledWith(modelSlug);
    expect(mockProvider.responses).not.toHaveBeenCalled();
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: chatModel, messages: [] })
    );
  });
});
