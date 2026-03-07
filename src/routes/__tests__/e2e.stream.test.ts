import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../services/upstreamService", async () => {
  const actual = await vi.importActual<typeof import("../../services/upstreamService")>(
    "../../services/upstreamService"
  );
  return {
    ...actual,
    callUpstreamStreaming: vi.fn(),
  };
});

vi.mock("../../services/billingService", () => ({
  billUsage: vi.fn(),
}));

import { createApp } from "../../app";
import { gatewayRouter } from "../../services/gatewayService";
import { callUpstreamStreaming } from "../../services/upstreamService";
import type { AsyncIterableStream, TextStreamPart, ToolSet } from "ai";

process.env.GATEWAY_API_KEY = "test-key";

const app = createApp();
const authHeader = { Authorization: "Bearer test-key" };

const provider = {
  id: 1,
  name: "Provider",
  protocol: "openai" as const,
  baseUrl: "https://example.com",
  apiKey: "sk-test",
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

const callUpstreamStreamingMock = vi.mocked(callUpstreamStreaming);
const getAllCandidatesSpy = vi.spyOn(gatewayRouter, "getAllCandidates");

describe("e2e streaming routes", () => {
  beforeEach(() => {
    callUpstreamStreamingMock.mockReset();
    getAllCandidatesSpy.mockReset();
    getAllCandidatesSpy.mockResolvedValue([provider]);
  });

  it("streams OpenAI SSE response", async () => {
    const stream =
      (async function* () {
        yield { type: "text-delta", id: "1", text: "Hi" };
      })() as unknown as AsyncIterableStream<TextStreamPart<ToolSet>>;

    callUpstreamStreamingMock.mockReturnValue({
      stream,
      usagePromise: Promise.resolve({ promptTokens: 1, completionTokens: 1 }),
    });

    const res = await app.request("/v1/chat/completions", {
      method: "POST",
      headers: authHeader,
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [{ role: "user", content: "hi" }],
        stream: true,
      }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const body = await res.text();
    expect(body).toContain("data: [DONE]");
    expect(body).toContain("chat.completion.chunk");
  });

  it("streams OpenAI Responses SSE response", async () => {
    const stream =
      (async function* () {
        yield { type: "text-delta", id: "1", text: "Hi" };
      })() as unknown as AsyncIterableStream<TextStreamPart<ToolSet>>;

    callUpstreamStreamingMock.mockReturnValue({
      stream,
      usagePromise: Promise.resolve({ promptTokens: 2, completionTokens: 3 }),
    });

    const res = await app.request("/v1/responses", {
      method: "POST",
      headers: authHeader,
      body: JSON.stringify({
        model: "gpt-5.2",
        input: "hi",
        stream: true,
      }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const body = await res.text();
    expect(body).not.toContain("[DONE]");

    const chunks = body
      .trim()
      .split("\n\n")
      .map((part) => JSON.parse(part.replace(/^data: /, "")));

    expect(chunks[0].type).toBe("response.created");
    expect(chunks[1].type).toBe("response.output_item.added");
    expect(chunks.some((chunk) => chunk.type === "response.output_text.delta")).toBe(
      true
    );
    expect(chunks.at(-1)?.type).toBe("response.completed");
    expect(chunks.at(-1)?.response.output_text).toBe("Hi");
    expect(chunks.at(-1)?.response.usage.total_tokens).toBe(5);
  });

  it("streams Anthropic SSE response", async () => {
    const stream =
      (async function* () {
        yield { type: "text-delta", id: "1", text: "Hello" };
      })() as unknown as AsyncIterableStream<TextStreamPart<ToolSet>>;

    callUpstreamStreamingMock.mockReturnValue({
      stream,
      usagePromise: Promise.resolve({ promptTokens: 1, completionTokens: 1 }),
    });

    const res = await app.request("/v1/messages", {
      method: "POST",
      headers: authHeader,
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [{ role: "user", content: "hi" }],
        stream: true,
      }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const body = await res.text();
    expect(body).toContain("event: content_block_delta");
    expect(body).toContain("event: message_stop");
  });
});
