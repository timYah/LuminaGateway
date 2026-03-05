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
});
