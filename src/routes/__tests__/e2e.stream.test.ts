import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

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
import { getDb, type SqliteDatabase } from "../../db";
import { providers, requestLogs } from "../../db/schema";
import { gatewayRouter } from "../../services/gatewayService";
import { callUpstreamStreaming } from "../../services/upstreamService";
import { configureTestDatabase } from "../../test/testDb";
import type { AsyncIterableStream, TextStreamPart, ToolSet } from "ai";

configureTestDatabase("e2e-stream");
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
  healthCheckModel: null,
  healthStatus: "unknown" as const,
  lastHealthCheckAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const callUpstreamStreamingMock = vi.mocked(callUpstreamStreaming);
const getAllCandidatesSpy = vi.spyOn(gatewayRouter, "getAllCandidates");

beforeAll(() => {
  migrate(db, { migrationsFolder: "drizzle" });
});

describe("e2e streaming routes", () => {
  beforeEach(() => {
    callUpstreamStreamingMock.mockReset();
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
