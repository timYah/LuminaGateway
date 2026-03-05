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
import { models, providers, usageLogs } from "../../db/schema";
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
    isActive: true,
    priority: 1,
  });
  const providerB = await createProvider({
    name: "Provider B",
    protocol: "openai",
    baseUrl: "https://example.com",
    apiKey: "sk-b",
    balance: 5,
    isActive: true,
    priority: 2,
  });

  await db.insert(models).values([
    {
      providerId: providerA!.id,
      slug: "gpt-4o",
      upstreamName: "gpt-4o",
      inputPrice: 1,
      outputPrice: 1,
    },
    {
      providerId: providerB!.id,
      slug: "gpt-4o",
      upstreamName: "gpt-4o",
      inputPrice: 1,
      outputPrice: 1,
    },
  ]);

  return { providerA, providerB };
}

beforeAll(() => {
  migrate(db, { migrationsFolder: "drizzle" });
});

beforeEach(() => {
  callUpstreamMock.mockReset();
  db.delete(usageLogs).run();
  db.delete(models).run();
  db.delete(providers).run();
  gatewayCircuitBreaker.reset(1);
  gatewayCircuitBreaker.reset(2);
});

describe("integration failover", () => {
  it("falls back when provider A returns 402", async () => {
    const { providerA, providerB } = await seedProviders();

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

    const providerRows = await db.select().from(providers);
    const updatedA = providerRows.find((row) => row.id === providerA!.id);
    const updatedB = providerRows.find((row) => row.id === providerB!.id);
    expect(updatedA?.balance).toBe(0);
    expect(updatedB?.balance).toBeGreaterThan(0);
  });
});
