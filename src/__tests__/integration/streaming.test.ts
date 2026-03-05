import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import type { AsyncIterableStream, TextStreamPart, ToolSet } from "ai";

vi.mock("../../services/upstreamService", async () => {
  const actual = await vi.importActual<typeof import("../../services/upstreamService")>(
    "../../services/upstreamService"
  );
  return {
    ...actual,
    callUpstreamStreaming: vi.fn(),
  };
});

import { createApp } from "../../app";
import { getDb, type SqliteDatabase } from "../../db";
import { models, providers, usageLogs } from "../../db/schema";
import { eq } from "drizzle-orm";
import { createProvider } from "../../services/providerService";
import { APICallError } from "ai";
import { callUpstreamStreaming } from "../../services/upstreamService";

process.env.DATABASE_TYPE = "sqlite";
process.env.DATABASE_URL = "file:./test-integration-streaming.db";
process.env.GATEWAY_API_KEY = "test-key";

const db = getDb() as SqliteDatabase;
const app = createApp();
const authHeader = { Authorization: "Bearer test-key" };
const callUpstreamMock = vi.mocked(callUpstreamStreaming);

async function seedProvider() {
  const provider = await createProvider({
    name: "Stream Provider",
    protocol: "openai",
    baseUrl: "https://example.com",
    apiKey: "sk-stream",
    balance: 10,
    isActive: true,
    priority: 1,
  });

  await db.insert(models).values({
    providerId: provider!.id,
    slug: "gpt-4o",
    upstreamName: "gpt-4o",
    inputPrice: 1,
    outputPrice: 1,
  });

  return provider;
}

async function seedProviders() {
  const providerA = await createProvider({
    name: "Stream Provider A",
    protocol: "openai",
    baseUrl: "https://example.com",
    apiKey: "sk-a",
    balance: 10,
    isActive: true,
    priority: 1,
  });
  const providerB = await createProvider({
    name: "Stream Provider B",
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
});

describe("integration streaming", () => {
  it("streams OpenAI SSE format", async () => {
    await seedProvider();
    const stream =
      (async function* () {
        yield { type: "text-delta", id: "1", text: "Hi" };
      })() as unknown as AsyncIterableStream<TextStreamPart<ToolSet>>;

    callUpstreamMock.mockReturnValue({
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
    const body = await res.text();
    expect(body).toContain("data: [DONE]");
    expect(body).toContain("chat.completion.chunk");
  });

  it("writes billing data after stream completes", async () => {
    const provider = await seedProvider();
    const stream =
      (async function* () {
        yield { type: "text-delta", id: "1", text: "Hi" };
      })() as unknown as AsyncIterableStream<TextStreamPart<ToolSet>>;

    callUpstreamMock.mockReturnValue({
      stream,
      usagePromise: Promise.resolve({ promptTokens: 1000, completionTokens: 500 }),
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
    await res.text();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const providerRow = await db
      .select()
      .from(providers)
      .where(eq(providers.id, provider!.id));
    const usageRows = await db.select().from(usageLogs);
    expect(usageRows).toHaveLength(1);
    expect(providerRow[0].balance).toBeLessThan(10);
  });

  it("fails over when upstream errors before stream starts", async () => {
    const { providerA, providerB } = await seedProviders();
    const stream =
      (async function* () {
        yield { type: "text-delta", id: "1", text: "Hi" };
      })() as unknown as AsyncIterableStream<TextStreamPart<ToolSet>>;

    callUpstreamMock
      .mockRejectedValueOnce(
        new APICallError({
          message: "rate limit",
          url: "https://example.com",
          requestBodyValues: {},
          statusCode: 429,
        })
      )
      .mockReturnValueOnce({
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
    expect(callUpstreamMock.mock.calls[0][0].id).toBe(providerA!.id);
    expect(callUpstreamMock.mock.calls[1][0].id).toBe(providerB!.id);
  });
});
