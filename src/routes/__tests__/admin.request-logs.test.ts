import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createApp } from "../../app";
import { getDb, type SqliteDatabase } from "../../db";
import { providers, requestLogs } from "../../db/schema";
import { createProvider } from "../../services/providerService";

process.env.DATABASE_TYPE = "sqlite";
process.env.DATABASE_URL = "file:./test-admin-request-logs.db";
process.env.GATEWAY_API_KEY = "test-key";

const db = getDb() as SqliteDatabase;
const app = createApp();
const authHeader = { Authorization: "Bearer test-key" };

beforeAll(() => {
  migrate(db, { migrationsFolder: "drizzle" });
});

beforeEach(() => {
  db.delete(requestLogs).run();
  db.delete(providers).run();
});

describe("admin request logs", () => {
  it("filters by provider, error type, and date range", async () => {
    const providerA = await createProvider({
      name: "Req A",
      protocol: "openai",
      baseUrl: "https://example.com",
      apiKey: "sk-a",
      balance: 1,
      isActive: true,
      priority: 1,
    });
    const providerB = await createProvider({
      name: "Req B",
      protocol: "openai",
      baseUrl: "https://example.com",
      apiKey: "sk-b",
      balance: 1,
      isActive: true,
      priority: 1,
    });

    await db.insert(requestLogs).values([
      {
        providerId: providerA!.id,
        modelSlug: "gpt-4o",
        result: "failure",
        errorType: "quota",
        latencyMs: 120,
        createdAt: new Date("2024-01-15T00:00:00Z"),
      },
      {
        providerId: providerB!.id,
        modelSlug: "gpt-4o-mini",
        result: "success",
        errorType: null,
        latencyMs: 80,
        createdAt: new Date("2024-02-10T00:00:00Z"),
      },
    ]);

    const res = await app.request(
      `/admin/request-logs?providerId=${providerA!.id}&errorType=quota&startDate=2024-01-01&endDate=2024-01-31`,
      { headers: authHeader }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.requests).toHaveLength(1);
    expect(body.requests[0].errorType).toBe("quota");
  });

  it("supports pagination with limit and offset", async () => {
    const providerA = await createProvider({
      name: "Req A",
      protocol: "openai",
      baseUrl: "https://example.com",
      apiKey: "sk-a",
      balance: 1,
      isActive: true,
      priority: 1,
    });

    await db.insert(requestLogs).values([
      {
        providerId: providerA!.id,
        modelSlug: "gpt-4o",
        result: "success",
        errorType: null,
        latencyMs: 120,
      },
      {
        providerId: providerA!.id,
        modelSlug: "gpt-4o",
        result: "failure",
        errorType: "server",
        latencyMs: 80,
      },
    ]);

    const res = await app.request("/admin/request-logs?limit=1&offset=1", {
      headers: authHeader,
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.requests).toHaveLength(1);
    expect(body.limit).toBe(1);
    expect(body.offset).toBe(1);
  });
});
