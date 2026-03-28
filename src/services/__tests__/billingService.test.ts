import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getDb, type SqliteDatabase } from "../../db";
import { providers, usageLogs } from "../../db/schema";
import { calculateCost, billUsage } from "../billingService";
import { createProvider, getProviderById } from "../providerService";
import { configureTestDatabase } from "../../test/testDb";

configureTestDatabase("billing");

const db = getDb() as SqliteDatabase;

beforeAll(() => {
  migrate(db, { migrationsFolder: "drizzle" });
});

beforeEach(() => {
  db.delete(usageLogs).run();
  db.delete(providers).run();
  delete process.env.DEFAULT_INPUT_PRICE;
  delete process.env.DEFAULT_OUTPUT_PRICE;
});

const baseProvider = {
  name: "Billing Provider",
  protocol: "openai" as const,
  baseUrl: "https://example.com",
  apiKey: "sk-billing",
  balance: 100,
  isActive: true,
  priority: 1,
};

describe("billingService", () => {
  it("calculateCost uses the correct formula", () => {
    const cost = calculateCost(1_000_000, 2_000_000, 2, 3);
    expect(cost).toBeCloseTo(8);
  });

  it("billUsage uses provider pricing when set", async () => {
    const provider = await createProvider({
      ...baseProvider,
      inputPrice: 2,
      outputPrice: 3,
    });

    await billUsage(
      provider!,
      "gpt-4o",
      { promptTokens: 1_000_000, completionTokens: 1_000_000 }
    );

    const updated = await getProviderById(provider!.id);
    expect(updated?.balance).toBeCloseTo(100);

    const logs = await db.select().from(usageLogs);
    expect(logs).toHaveLength(1);
    expect(logs[0].cost).toBeCloseTo(5);
    expect(logs[0].usageSource).toBe("actual");
  });

  it("billUsage falls back to default env pricing", async () => {
    process.env.DEFAULT_INPUT_PRICE = "1.5";
    process.env.DEFAULT_OUTPUT_PRICE = "2.5";
    const provider = await createProvider(baseProvider);

    await billUsage(
      provider!,
      "gpt-4o",
      { promptTokens: 1_000_000, completionTokens: 1_000_000 }
    );

    const logs = await db.select().from(usageLogs);
    expect(logs).toHaveLength(1);
    expect(logs[0].cost).toBeCloseTo(4);
  });

  it("billUsage uses zero when no pricing is set", async () => {
    const provider = await createProvider(baseProvider);

    await billUsage(
      provider!,
      "gpt-4o",
      { promptTokens: 1000, completionTokens: 2000 }
    );

    const logs = await db.select().from(usageLogs);
    expect(logs).toHaveLength(1);
    expect(logs[0].cost).toBe(0);
  });

  it("billUsage stores route and request metadata when provided", async () => {
    const provider = await createProvider(baseProvider);

    await billUsage(
      provider!,
      "gpt-4o",
      { promptTokens: 10, completionTokens: 20 },
      { routePath: "/v1/chat/completions", requestId: "req_usage_1" }
    );

    const logs = await db.select().from(usageLogs);
    expect(logs).toHaveLength(1);
    expect(logs[0].routePath).toBe("/v1/chat/completions");
    expect(logs[0].requestId).toBe("req_usage_1");
    expect(logs[0].usageSource).toBe("actual");
  });

  it("billUsage skips when usage is missing", async () => {
    const provider = await createProvider(baseProvider);

    const result = await billUsage(provider!, "gpt-4o", null);
    expect(result).toBeNull();

    const logs = await db.select().from(usageLogs);
    expect(logs).toHaveLength(0);
  });
});
