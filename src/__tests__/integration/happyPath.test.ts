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

import { createApp } from "../../app";
import { getDb, type SqliteDatabase } from "../../db";
import { providers, usageLogs } from "../../db/schema";
import { createProvider, getProviderById } from "../../services/providerService";
import { callUpstreamNonStreaming } from "../../services/upstreamService";
import { configureTestDatabase } from "../../test/testDb";

configureTestDatabase("integration-happy");
process.env.GATEWAY_API_KEY = "test-key";

const db = getDb() as SqliteDatabase;
const app = createApp();
const authHeader = { Authorization: "Bearer test-key" };
const callUpstreamMock = vi.mocked(callUpstreamNonStreaming);

beforeAll(() => {
  migrate(db, { migrationsFolder: "drizzle" });
});

beforeEach(() => {
  callUpstreamMock.mockReset();
  db.delete(usageLogs).run();
  db.delete(providers).run();
});

describe("integration happy path", () => {
  it("handles full non-streaming flow with billing", async () => {
    const provider = await createProvider({
      name: "Happy Provider",
      protocol: "openai",
      baseUrl: "https://example.com",
      apiKey: "sk-happy",
      balance: 10,
      inputPrice: 2,
      outputPrice: 4,
      isActive: true,
      priority: 1,
    });

    callUpstreamMock.mockResolvedValue({
      result: {
        text: "Hello",
        finishReason: "stop",
      },
      usage: { promptTokens: 1000, completionTokens: 500 },
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

    const updated = await getProviderById(provider!.id);
    expect(updated?.balance).toBeCloseTo(10);

    const logs = await db.select().from(usageLogs);
    expect(logs).toHaveLength(1);
    expect(logs[0].modelSlug).toBe("gpt-4o");
    expect(logs[0].usageSource).toBe("actual");
    expect(logs[0].routePath).toBe("/v1/chat/completions");
    expect(logs[0].requestId).toBeTruthy();
  });
});
