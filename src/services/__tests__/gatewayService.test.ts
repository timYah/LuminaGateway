import { beforeEach, describe, expect, it, vi } from "vitest";
import { APICallError } from "ai";
import type { AsyncIterableStream, TextStreamPart, ToolSet } from "ai";

vi.mock("../upstreamService", async () => {
  const actual = await vi.importActual<typeof import("../upstreamService")>(
    "../upstreamService"
  );
  return {
    ...actual,
    callUpstreamNonStreaming: vi.fn(),
    callUpstreamStreaming: vi.fn(),
  };
});

vi.mock("../billingService", () => ({
  billUsage: vi.fn(),
}));

vi.mock("../requestLogService", () => ({
  createRequestLog: vi.fn(),
}));

vi.mock("../providerService", () => ({
  deactivateProvider: vi.fn(),
}));

vi.mock("../streamRelay", () => ({
  relayAsOpenAIStream: vi.fn(() => new ReadableStream()),
  relayAsOpenAIResponsesStream: vi.fn(() => new ReadableStream()),
  relayAsAnthropicStream: vi.fn(() => new ReadableStream()),
}));

import {
  handleRequest,
  handleStreamingRequest,
  gatewayCircuitBreaker,
  gatewayRouter,
} from "../gatewayService";
import { gatewayInflightLimiter } from "../inflightService";
import { callUpstreamNonStreaming, callUpstreamStreaming } from "../upstreamService";
import { billUsage } from "../billingService";
import {
  relayAsOpenAIResponsesStream,
  relayAsOpenAIStream,
} from "../streamRelay";
import { providerRecoveryService } from "../providerRecoveryService";

const providerA = {
  id: 1,
  name: "Provider A",
  protocol: "openai" as const,
  baseUrl: "https://example.com",
  apiKey: "sk-a",
  apiMode: "responses" as const,
  codexTransform: false,
  balance: 10,
  inputPrice: null,
  outputPrice: null,
  isActive: true,
  priority: 1,
  healthCheckModel: null,
  healthStatus: "unknown" as const,
  lastHealthCheckAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const providerB = {
  id: 2,
  name: "Provider B",
  protocol: "openai" as const,
  baseUrl: "https://example.com",
  apiKey: "sk-b",
  apiMode: "responses" as const,
  codexTransform: false,
  balance: 10,
  inputPrice: null,
  outputPrice: null,
  isActive: true,
  priority: 2,
  healthCheckModel: null,
  healthStatus: "unknown" as const,
  lastHealthCheckAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const callUpstreamMock = vi.mocked(callUpstreamNonStreaming);
const callUpstreamStreamingMock = vi.mocked(callUpstreamStreaming);
const billUsageMock = vi.mocked(billUsage);
const getAllCandidatesSpy = vi.spyOn(gatewayRouter, "getAllCandidates");
const relayOpenAIMock = vi.mocked(relayAsOpenAIStream);
const relayOpenAIResponsesMock = vi.mocked(relayAsOpenAIResponsesStream);
const breakerOpenSpy = vi.spyOn(gatewayCircuitBreaker, "open");

describe("gatewayService", () => {
  beforeEach(() => {
    callUpstreamMock.mockReset();
    callUpstreamStreamingMock.mockReset();
    billUsageMock.mockReset();
    getAllCandidatesSpy.mockReset();
    getAllCandidatesSpy.mockResolvedValue([providerA]);
    relayOpenAIMock.mockClear();
    relayOpenAIResponsesMock.mockClear();
    breakerOpenSpy.mockReset();
    gatewayCircuitBreaker.reset(providerA.id);
    gatewayCircuitBreaker.reset(providerB.id);
    providerRecoveryService.resetAll();
    providerRecoveryService.stop();
    gatewayInflightLimiter.reset();
    delete process.env.PROVIDER_MAX_INFLIGHT;
    delete process.env.PROVIDER_MAX_INFLIGHT_OVERRIDES;
    delete process.env.UPSTREAM_RETRY_ATTEMPTS;
    delete process.env.UPSTREAM_RETRY_BASE_MS;
  });

  it("handles a successful request", async () => {
    callUpstreamMock.mockResolvedValue({
      result: {
        text: "Hello",
        finishReason: "stop",
      },
      usage: { promptTokens: 2, completionTokens: 3 },
    } as unknown as Awaited<ReturnType<typeof callUpstreamNonStreaming>>);

    const response = await handleRequest(
      { model: "gpt-4o", messages: [] },
      "openai"
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      object: "chat.completion",
      model: "gpt-4o",
    });
    expect(billUsageMock).toHaveBeenCalledWith(
      providerA,
      "gpt-4o",
      { promptTokens: 2, completionTokens: 3 },
      { requestId: undefined, routePath: undefined }
    );
  });

  it("formats Responses API requests with a response object", async () => {
    callUpstreamMock.mockResolvedValue({
      result: {
        text: "Hello Responses",
        finishReason: "stop",
      },
      usage: { promptTokens: 4, completionTokens: 5 },
    } as unknown as Awaited<ReturnType<typeof callUpstreamNonStreaming>>);

    const response = await handleRequest(
      { model: "gpt-5.2", messages: [] },
      "openai-responses"
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      object: "response",
      model: "gpt-5.2",
      output_text: "Hello Responses",
    });
  });

  it("falls back when the first provider is exhausted", async () => {
    getAllCandidatesSpy.mockResolvedValue([providerA, providerB]);
    callUpstreamMock
      .mockRejectedValueOnce(
        new APICallError({
          message: "quota",
          url: "https://example.com",
          requestBodyValues: {},
          statusCode: 402,
        })
      )
      .mockResolvedValueOnce({
        result: {
          text: "Fallback",
          finishReason: "stop",
        },
        usage: { promptTokens: 1, completionTokens: 1 },
      } as unknown as Awaited<ReturnType<typeof callUpstreamNonStreaming>>);

    const response = await handleRequest(
      { model: "gpt-4o", messages: [] },
      "openai"
    );

    expect(response.status).toBe(200);
    expect(breakerOpenSpy).toHaveBeenCalledWith(
      providerA.id,
      expect.any(Number),
      "gpt-4o"
    );
  });

  it("falls back when the model is not found", async () => {
    getAllCandidatesSpy.mockResolvedValue([providerA, providerB]);
    callUpstreamMock
      .mockRejectedValueOnce(
        new APICallError({
          message: "Model not found",
          url: "https://example.com",
          requestBodyValues: {},
          statusCode: 404,
        })
      )
      .mockResolvedValueOnce({
        result: {
          text: "Fallback",
          finishReason: "stop",
        },
        usage: { promptTokens: 1, completionTokens: 1 },
      } as unknown as Awaited<ReturnType<typeof callUpstreamNonStreaming>>);

    const response = await handleRequest(
      { model: "gpt-4o", messages: [] },
      "openai"
    );

    expect(response.status).toBe(200);
    expect(callUpstreamMock.mock.calls[0][0].id).toBe(providerA.id);
    expect(callUpstreamMock.mock.calls[1][0].id).toBe(providerB.id);
  });

  it("falls back on unknown errors", async () => {
    getAllCandidatesSpy.mockResolvedValue([providerA, providerB]);
    callUpstreamMock
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({
        result: {
          text: "Fallback",
          finishReason: "stop",
        },
        usage: { promptTokens: 1, completionTokens: 1 },
      } as unknown as Awaited<ReturnType<typeof callUpstreamNonStreaming>>);

    const response = await handleRequest(
      { model: "gpt-4o", messages: [] },
      "openai"
    );

    expect(response.status).toBe(200);
    expect(callUpstreamMock.mock.calls[0][0].id).toBe(providerA.id);
    expect(callUpstreamMock.mock.calls[1][0].id).toBe(providerB.id);
  });

  it("returns an error when no providers are available", async () => {
    getAllCandidatesSpy.mockResolvedValue([]);

    const response = await handleRequest(
      { model: "gpt-4o", messages: [] },
      "anthropic"
    );

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ type: "error" });
  });

  it("retries upstream requests on retryable errors", async () => {
    process.env.UPSTREAM_RETRY_ATTEMPTS = "1";
    process.env.UPSTREAM_RETRY_BASE_MS = "0";
    callUpstreamMock
      .mockRejectedValueOnce(new Error("fetch failed"))
      .mockResolvedValueOnce({
        result: {
          text: "Hello",
          finishReason: "stop",
        },
        usage: { promptTokens: 2, completionTokens: 3 },
      } as unknown as Awaited<ReturnType<typeof callUpstreamNonStreaming>>);

    const response = await handleRequest(
      { model: "gpt-4o", messages: [] },
      "openai"
    );

    expect(response.status).toBe(200);
    expect(callUpstreamMock).toHaveBeenCalledTimes(2);
  });

  it("skips providers that exceed inflight limits", async () => {
    process.env.PROVIDER_MAX_INFLIGHT = "1";
    let resolveUpstream!: (
      value: Awaited<ReturnType<typeof callUpstreamNonStreaming>>
    ) => void;
    callUpstreamMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveUpstream = resolve as typeof resolveUpstream;
        }) as ReturnType<typeof callUpstreamNonStreaming>
    );

    const first = handleRequest(
      { model: "gpt-4o", messages: [] },
      "openai"
    );

    await Promise.resolve();

    const second = await handleRequest(
      { model: "gpt-4o", messages: [] },
      "openai"
    );

    expect(second.status).toBe(503);

    resolveUpstream({
      result: { text: "ok", finishReason: "stop" },
      usage: { promptTokens: 1, completionTokens: 1 },
    } as Awaited<ReturnType<typeof callUpstreamNonStreaming>>);

    const firstResponse = await first;
    expect(firstResponse.status).toBe(200);
  });

  it("handles a streaming chat request and bills after completion", async () => {
    const stream =
      (async function* () {
        yield { type: "text-delta", id: "1", text: "hi" };
      })() as unknown as AsyncIterableStream<TextStreamPart<ToolSet>>;

    callUpstreamStreamingMock.mockReturnValue({
      stream,
      usagePromise: Promise.resolve({ promptTokens: 1, completionTokens: 2 }),
    });

    const response = await handleStreamingRequest(
      { model: "gpt-4o", messages: [] },
      "openai"
    );

    expect(response.status).toBe(200);
    expect("stream" in response).toBe(true);
    expect(relayOpenAIMock).toHaveBeenCalledWith(stream, "gpt-4o");

    await Promise.resolve();
    await Promise.resolve();
    expect(billUsageMock).toHaveBeenCalledWith(
      providerA,
      "gpt-4o",
      { promptTokens: 1, completionTokens: 2 },
      { requestId: undefined, routePath: undefined }
    );
  });

  it("formats a streaming request as OpenAI Responses when requested", async () => {
    const stream =
      (async function* () {
        yield { type: "text-delta", id: "1", text: "hi" };
      })() as unknown as AsyncIterableStream<TextStreamPart<ToolSet>>;

    const usagePromise = Promise.resolve({ promptTokens: 2, completionTokens: 3 });
    callUpstreamStreamingMock.mockReturnValue({
      stream,
      usagePromise,
    });

    const response = await handleStreamingRequest(
      { model: "gpt-5.2", messages: [] },
      "openai-responses"
    );

    expect(response.status).toBe(200);
    expect("stream" in response).toBe(true);
    expect(relayOpenAIResponsesMock).toHaveBeenCalledWith(
      stream,
      "gpt-5.2",
      usagePromise,
      undefined
    );
  });

  it("falls back on streaming error before start", async () => {
    getAllCandidatesSpy.mockResolvedValue([providerA, providerB]);
    callUpstreamStreamingMock
      .mockRejectedValueOnce(
        new APICallError({
          message: "quota",
          url: "https://example.com",
          requestBodyValues: {},
          statusCode: 402,
        })
      )
      .mockReturnValueOnce({
        stream:
          (async function* () {
            yield { type: "text-delta", id: "1", text: "ok" };
          })() as unknown as AsyncIterableStream<TextStreamPart<ToolSet>>,
        usagePromise: Promise.resolve({ promptTokens: 1, completionTokens: 1 }),
      });

    const response = await handleStreamingRequest(
      { model: "gpt-4o", messages: [] },
      "openai"
    );

    expect(response.status).toBe(200);
    expect(breakerOpenSpy).toHaveBeenCalledWith(
      providerA.id,
      expect.any(Number),
      "gpt-4o"
    );
  });

  it("falls back on unknown streaming errors before start", async () => {
    getAllCandidatesSpy.mockResolvedValue([providerA, providerB]);
    callUpstreamStreamingMock
      .mockRejectedValueOnce(new Error("boom"))
      .mockReturnValueOnce({
        stream:
          (async function* () {
            yield { type: "text-delta", id: "1", text: "ok" };
          })() as unknown as AsyncIterableStream<TextStreamPart<ToolSet>>,
        usagePromise: Promise.resolve({ promptTokens: 1, completionTokens: 1 }),
      });

    const response = await handleStreamingRequest(
      { model: "gpt-4o", messages: [] },
      "openai"
    );

    expect(response.status).toBe(200);
    expect(callUpstreamStreamingMock).toHaveBeenCalledTimes(2);
  });

  it("marks provider recovering when a streaming request fails mid-flight", async () => {
    const stream =
      (async function* () {
        yield { type: "text-delta", id: "1", text: "hi" };
      })() as unknown as AsyncIterableStream<TextStreamPart<ToolSet>>;

    callUpstreamStreamingMock.mockReturnValue({
      stream,
      usagePromise: Promise.reject(
        new APICallError({
          message: "rate limited",
          url: "https://example.com",
          requestBodyValues: {},
          statusCode: 429,
        })
      ),
    });

    const response = await handleStreamingRequest(
      { model: "gpt-4o", messages: [] },
      "openai"
    );

    expect(response.status).toBe(200);
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(providerRecoveryService.isRecovering(providerA.id, "gpt-4o")).toBe(true);
    expect(providerRecoveryService.getEntry(providerA.id, "gpt-4o")?.probeModel).toBe(
      "gpt-4o"
    );
    expect(breakerOpenSpy).toHaveBeenCalledWith(providerA.id, 60_000, "gpt-4o");
  });
});
