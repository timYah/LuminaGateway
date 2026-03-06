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
  balance: 10,
  isActive: true,
  priority: 1,
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
