import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

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
import { getDb, type SqliteDatabase } from "../../db";
import { providers, requestLogs } from "../../db/schema";
import { gatewayRouter } from "../../services/gatewayService";
import { callUpstreamNonStreaming } from "../../services/upstreamService";
import { configureTestDatabase } from "../../test/testDb";

configureTestDatabase("e2e-nonstream");
process.env.GATEWAY_API_KEY = "test-key";

const db = getDb() as SqliteDatabase;
const app = createApp();
const authHeader = { Authorization: "Bearer test-key" };

const provider = {
  id: 1,
  name: "Provider",
  protocol: "openai" as const,
  baseUrl: "https://example.com",
  apiKey: "sk-test",
  apiMode: "responses" as const,
  codexTransform: false,
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

const callUpstreamMock = vi.mocked(callUpstreamNonStreaming);
const getAllCandidatesSpy = vi.spyOn(gatewayRouter, "getAllCandidates");

beforeAll(() => {
  migrate(db, { migrationsFolder: "drizzle" });
});

describe("e2e non-streaming routes", () => {
  beforeEach(() => {
    callUpstreamMock.mockReset();
    getAllCandidatesSpy.mockReset();
    getAllCandidatesSpy.mockResolvedValue([provider]);
    db.delete(requestLogs).run();
    db.delete(providers).run();
    db.insert(providers).values({
      id: provider.id,
      name: provider.name,
      protocol: provider.protocol,
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
      apiMode: provider.apiMode,
      codexTransform: provider.codexTransform,
      balance: provider.balance,
      inputPrice: provider.inputPrice,
      outputPrice: provider.outputPrice,
      isActive: provider.isActive,
      priority: provider.priority,
      healthStatus: provider.healthStatus,
      lastHealthCheckAt: provider.lastHealthCheckAt,
    }).run();
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

  it("handles OpenAI Responses non-streaming request", async () => {
    callUpstreamMock.mockResolvedValue({
      result: {
        text: "Hello Responses",
        finishReason: "stop",
      },
      usage: { promptTokens: 4, completionTokens: 5 },
    } as unknown as Awaited<ReturnType<typeof callUpstreamNonStreaming>>);

    const res = await app.request("/v1/responses", {
      method: "POST",
      headers: authHeader,
      body: JSON.stringify({
        model: "gpt-5.2",
        instructions: "Be helpful",
        input: [
          {
            role: "developer",
            content: [{ type: "input_text", text: "Be concise" }],
          },
          {
            role: "user",
            content: [{ type: "input_text", text: "hi" }],
          },
        ],
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.object).toBe("response");
    expect(body.output_text).toBe("Hello Responses");
    expect(body.output[0]?.content[0]?.text).toBe("Hello Responses");
    expect(body.usage?.input_tokens).toBe(4);
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
