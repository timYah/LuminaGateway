import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createApp } from "../../app";
import { getDb, type SqliteDatabase } from "../../db";
import { providers, usageLogs } from "../../db/schema";
import { createProvider } from "../../services/providerService";
import { configureTestDatabase } from "../../test/testDb";

configureTestDatabase("admin-usage");
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

describe("admin usage list", () => {
  it("filters by provider, model, and date range", async () => {
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
        usageSource: "estimated",
        routePath: "/openai/v1/responses",
        requestId: "req_usage_a",
        inputTokens: 10,
        outputTokens: 5,
        cost: 0.1,
        createdAt: new Date("2024-01-15"),
      },
      {
        providerId: providerB!.id,
        modelSlug: "gpt-4o-mini",
        usageSource: "actual",
        routePath: "/v1/responses",
        requestId: "req_usage_b",
        inputTokens: 12,
        outputTokens: 6,
        cost: 0.2,
        createdAt: new Date("2024-02-10"),
      },
    ]);

    const res = await app.request(
      `/admin/usage?providerId=${providerA!.id}&modelSlug=gpt-4o&startDate=2024-01-01&endDate=2024-01-31`,
      { headers: authHeader }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.usage).toHaveLength(1);
    expect(body.usage[0].modelSlug).toBe("gpt-4o");
    expect(body.usage[0].usageSource).toBe("estimated");
    expect(body.usage[0].routePath).toBe("/openai/v1/responses");
    expect(body.usage[0].requestId).toBe("req_usage_a");
  });

  it("supports pagination with limit and offset", async () => {
    const providerA = await createProvider({
      name: "Usage A",
      protocol: "openai",
      baseUrl: "https://example.com",
      apiKey: "sk-a",
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
        createdAt: new Date("2024-01-15"),
      },
      {
        providerId: providerA!.id,
        modelSlug: "gpt-4o",
        inputTokens: 12,
        outputTokens: 6,
        cost: 0.2,
        createdAt: new Date("2024-02-10"),
      },
    ]);

    const res = await app.request("/admin/usage?limit=1&offset=1", {
      headers: authHeader,
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.usage).toHaveLength(1);
    expect(body.limit).toBe(1);
    expect(body.offset).toBe(1);
  });
});
