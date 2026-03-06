import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { APICallError } from "ai";

vi.mock("../../services/upstreamService", async () => {
  const actual = await vi.importActual<typeof import("../../services/upstreamService")>(
    "../../services/upstreamService"
  );
  return {
    ...actual,
    callUpstreamNonStreaming: vi.fn(),
  };
});

import { createApp } from "../../app";
import { getDb, type SqliteDatabase } from "../../db";
import { providers, usageLogs } from "../../db/schema";
import { createProvider } from "../../services/providerService";
import { callUpstreamNonStreaming } from "../../services/upstreamService";
import { gatewayCircuitBreaker } from "../../services/gatewayService";

process.env.DATABASE_TYPE = "sqlite";
process.env.DATABASE_URL = "file:./test-integration-failover.db";
process.env.GATEWAY_API_KEY = "test-key";

const db = getDb() as SqliteDatabase;
const app = createApp();
const authHeader = { Authorization: "Bearer test-key" };
const callUpstreamMock = vi.mocked(callUpstreamNonStreaming);

async function seedProviders() {
  const providerA = await createProvider({
    name: "Provider A",
    protocol: "openai",
    baseUrl: "https://example.com",
    apiKey: "sk-a",
    balance: 10,
    inputPrice: 1,
    outputPrice: 1,
    isActive: true,
    priority: 1,
  });
  const providerB = await createProvider({
    name: "Provider B",
    protocol: "openai",
    baseUrl: "https://example.com",
    apiKey: "sk-b",
    balance: 5,
    inputPrice: 1,
    outputPrice: 1,
    isActive: true,
    priority: 2,
  });

  return { providerA, providerB };
}

beforeAll(() => {
  migrate(db, { migrationsFolder: "drizzle" });
});

beforeEach(() => {
  callUpstreamMock.mockReset();
  db.delete(usageLogs).run();
  db.delete(providers).run();
  gatewayCircuitBreaker.reset(1);
  gatewayCircuitBreaker.reset(2);
});

describe("integration failover", () => {
  it("falls back when provider A returns 402", async () => {
    const { providerA } = await seedProviders();

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
        result: { text: "Fallback", finishReason: "stop" },
        usage: { promptTokens: 10, completionTokens: 5 },
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
    expect(body.choices[0].message.content).toBe("Fallback");

    expect(gatewayCircuitBreaker.isOpen(providerA!.id)).toBe(true);
  });

  it("returns error when all providers fail", async () => {
    await seedProviders();

    callUpstreamMock
      .mockRejectedValueOnce(
        new APICallError({
          message: "auth",
          url: "https://example.com",
          requestBodyValues: {},
          statusCode: 401,
        })
      )
      .mockRejectedValueOnce(
        new APICallError({
          message: "auth",
          url: "https://example.com",
          requestBodyValues: {},
          statusCode: 401,
        })
      );

    const res = await app.request("/v1/chat/completions", {
      method: "POST",
      headers: authHeader,
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [{ role: "user", content: "hi" }],
      }),
    });

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error?.message).toBeDefined();
  });

  it("opens circuit breaker on 429 and skips provider on next request", async () => {
    const { providerA, providerB } = await seedProviders();

    callUpstreamMock
      .mockRejectedValueOnce(
        new APICallError({
          message: "rate limit",
          url: "https://example.com",
          requestBodyValues: {},
          statusCode: 429,
        })
      )
      .mockResolvedValueOnce({
        result: { text: "Ok", finishReason: "stop" },
        usage: { promptTokens: 1, completionTokens: 1 },
      } as unknown as Awaited<ReturnType<typeof callUpstreamNonStreaming>>)
      .mockResolvedValueOnce({
        result: { text: "Ok again", finishReason: "stop" },
        usage: { promptTokens: 1, completionTokens: 1 },
      } as unknown as Awaited<ReturnType<typeof callUpstreamNonStreaming>>);

    const requestBody = JSON.stringify({
      model: "gpt-4o",
      messages: [{ role: "user", content: "hi" }],
    });

    const first = await app.request("/v1/chat/completions", {
      method: "POST",
      headers: authHeader,
      body: requestBody,
    });
    expect(first.status).toBe(200);

    const second = await app.request("/v1/chat/completions", {
      method: "POST",
      headers: authHeader,
      body: requestBody,
    });
    expect(second.status).toBe(200);

    expect(callUpstreamMock.mock.calls[0][0].id).toBe(providerA!.id);
    expect(callUpstreamMock.mock.calls[1][0].id).toBe(providerB!.id);
    expect(callUpstreamMock.mock.calls[2][0].id).toBe(providerB!.id);
  });
});
