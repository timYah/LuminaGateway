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
  relayAsAnthropicStream: vi.fn(() => new ReadableStream()),
}));

import {
  handleRequest,
  handleStreamingRequest,
  gatewayCircuitBreaker,
  gatewayRouter,
} from "../gatewayService";
import { callUpstreamNonStreaming, callUpstreamStreaming } from "../upstreamService";
import { billUsage } from "../billingService";
import { relayAsOpenAIStream } from "../streamRelay";

const providerA = {
  id: 1,
  name: "Provider A",
  protocol: "openai" as const,
  baseUrl: "https://example.com",
  apiKey: "sk-a",
  apiMode: "responses" as const,
  balance: 10,
  inputPrice: null,
  outputPrice: null,
  isActive: true,
  priority: 1,
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
  balance: 10,
  inputPrice: null,
  outputPrice: null,
  isActive: true,
  priority: 2,
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
const breakerOpenSpy = vi.spyOn(gatewayCircuitBreaker, "open");

describe("gatewayService", () => {
  beforeEach(() => {
    callUpstreamMock.mockReset();
    callUpstreamStreamingMock.mockReset();
    billUsageMock.mockReset();
    getAllCandidatesSpy.mockReset();
    getAllCandidatesSpy.mockResolvedValue([providerA]);
    relayOpenAIMock.mockClear();
    breakerOpenSpy.mockReset();
    gatewayCircuitBreaker.reset(providerA.id);
    gatewayCircuitBreaker.reset(providerB.id);
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
      { promptTokens: 2, completionTokens: 3 }
    );
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
      expect.any(Number)
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

  it("returns an error when no providers are available", async () => {
    getAllCandidatesSpy.mockResolvedValue([]);

    const response = await handleRequest(
      { model: "gpt-4o", messages: [] },
      "anthropic"
    );

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ type: "error" });
  });

  it("handles a streaming request and bills after completion", async () => {
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
      { promptTokens: 1, completionTokens: 2 }
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
      expect.any(Number)
    );
  });
});
