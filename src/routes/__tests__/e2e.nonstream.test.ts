import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../services/upstreamService", async () => {
  const actual = await vi.importActual<typeof import("../../services/upstreamService")>(
    "../../services/upstreamService"
  );
  return {
    ...actual,
    callUpstreamNonStreaming: vi.fn(),
  };
});

vi.mock("../../services/billingService", () => ({
  billUsage: vi.fn(),
}));

import { createApp } from "../../app";
import { gatewayRouter } from "../../services/gatewayService";
import { callUpstreamNonStreaming } from "../../services/upstreamService";

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
  createdAt: new Date(),
  updatedAt: new Date(),
};

const callUpstreamMock = vi.mocked(callUpstreamNonStreaming);
const getAllCandidatesSpy = vi.spyOn(gatewayRouter, "getAllCandidates");

describe("e2e non-streaming routes", () => {
  beforeEach(() => {
    callUpstreamMock.mockReset();
    getAllCandidatesSpy.mockReset();
    getAllCandidatesSpy.mockResolvedValue([provider]);
  });

  it("handles OpenAI non-streaming request", async () => {
    callUpstreamMock.mockResolvedValue({
      result: {
        text: "Hello OpenAI",
        finishReason: "stop",
      },
      usage: { promptTokens: 2, completionTokens: 3 },
    } as unknown as Awaited<ReturnType<typeof callUpstreamNonStreaming>>);

    const res = await app.request("/v1/chat/completions", {
      method: "POST",
      headers: authHeader,
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [{ role: "user", content: "hi" }],
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.object).toBe("chat.completion");
    expect(body.choices[0].message.content).toBe("Hello OpenAI");
  });

  it("handles Anthropic non-streaming request", async () => {
    callUpstreamMock.mockResolvedValue({
      result: {
        text: "Hello Anthropic",
        finishReason: "stop",
      },
      usage: { promptTokens: 1, completionTokens: 1 },
    } as unknown as Awaited<ReturnType<typeof callUpstreamNonStreaming>>);

    const res = await app.request("/v1/messages", {
      method: "POST",
      headers: authHeader,
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [{ role: "user", content: "hi" }],
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.type).toBe("message");
    expect(body.content[0].text).toBe("Hello Anthropic");
  });
});
