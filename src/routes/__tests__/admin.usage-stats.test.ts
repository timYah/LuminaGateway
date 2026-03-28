import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createApp } from "../../app";
import { getDb, type SqliteDatabase } from "../../db";
import { providers, usageLogs } from "../../db/schema";
import { createProvider } from "../../services/providerService";
import { configureTestDatabase } from "../../test/testDb";

configureTestDatabase("admin-usage-stats");
process.env.GATEWAY_API_KEY = "test-key";

const db = getDb() as SqliteDatabase;
const app = createApp();
const authHeader = { Authorization: "Bearer test-key" };

beforeAll(() => {
  migrate(db, { migrationsFolder: "drizzle" });
});

beforeEach(() => {
  db.delete(usageLogs).run();
  db.delete(providers).run();
});

describe("admin usage stats", () => {
  it("aggregates token totals, trends, and distributions", async () => {
    const providerA = await createProvider({
      name: "Usage A",
      protocol: "openai",
      baseUrl: "https://example.com",
      apiKey: "sk-a",
      balance: 1,
      isActive: true,
      priority: 1,
    });
    const providerB = await createProvider({
      name: "Usage B",
      protocol: "openai",
      baseUrl: "https://example.com",
      apiKey: "sk-b",
      balance: 1,
      isActive: true,
      priority: 1,
    });

    await db.insert(usageLogs).values([
      {
        providerId: providerA!.id,
        modelSlug: "gpt-4o",
        inputTokens: 10,
        outputTokens: 5,
        cost: 0.1,
        createdAt: new Date("2024-01-15T00:00:00Z"),
      },
      {
        providerId: providerB!.id,
        modelSlug: "gpt-4o",
        inputTokens: 12,
        outputTokens: 6,
        cost: 0.2,
        createdAt: new Date("2024-01-16T00:00:00Z"),
      },
      {
        providerId: providerA!.id,
        modelSlug: "gpt-4.1",
        inputTokens: 20,
        outputTokens: 10,
        cost: 0.4,
        createdAt: new Date("2024-01-16T12:00:00Z"),
      },
    ]);

    const res = await app.request(
      `/admin/usage/stats?providerId=${providerA!.id}&modelSlug=gpt-4o&startDate=2024-01-01&endDate=2024-01-31`,
      { headers: authHeader }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary).toEqual({
      requestCount: 1,
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
      totalCost: 0.1,
    });
    expect(body.trend).toHaveLength(1);
    expect(body.trend[0]).toMatchObject({
      date: "2024-01-15",
      requestCount: 1,
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
      totalCost: 0.1,
    });
    expect(body.byProvider).toHaveLength(1);
    expect(body.byModel).toHaveLength(1);
    expect(body.byProvider[0]).toMatchObject({
      providerId: providerA!.id,
      requestCount: 1,
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
      totalCost: 0.1,
    });
    expect(body.byModel[0]).toMatchObject({
      modelSlug: "gpt-4o",
      requestCount: 1,
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
      totalCost: 0.1,
    });
  });
});
