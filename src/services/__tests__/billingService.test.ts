import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getDb, type SqliteDatabase } from "../../db";
import { models, providers, usageLogs } from "../../db/schema";
import { calculateCost, billUsage } from "../billingService";
import { createProvider, getProviderById } from "../providerService";

process.env.DATABASE_TYPE = "sqlite";
process.env.DATABASE_URL = "file:./test-billing.db";

const db = getDb() as SqliteDatabase;

beforeAll(() => {
  migrate(db, { migrationsFolder: "drizzle" });
});

beforeEach(() => {
  db.delete(usageLogs).run();
  db.delete(models).run();
  db.delete(providers).run();
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

  it("billUsage deducts balance and writes usage log", async () => {
    const provider = await createProvider(baseProvider);
    const rows = await db
      .insert(models)
      .values({
        providerId: provider!.id,
        slug: "gpt-4o",
        upstreamName: "gpt-4o",
        inputPrice: 2,
        outputPrice: 3,
      })
      .returning();
    const model = rows[0]!;

    await billUsage(
      provider!.id,
      model.slug,
      { promptTokens: 1_000_000, completionTokens: 1_000_000 },
      model
    );

    const updated = await getProviderById(provider!.id);
    expect(updated?.balance).toBeCloseTo(95);

    const logs = await db.select().from(usageLogs);
    expect(logs).toHaveLength(1);
    expect(logs[0].cost).toBeCloseTo(5);
    expect(logs[0].inputTokens).toBe(1_000_000);
    expect(logs[0].outputTokens).toBe(1_000_000);
  });

  it("billUsage skips when usage is missing", async () => {
    const provider = await createProvider(baseProvider);
    const rows = await db
      .insert(models)
      .values({
        providerId: provider!.id,
        slug: "gpt-4o",
        upstreamName: "gpt-4o",
        inputPrice: 2,
        outputPrice: 3,
      })
      .returning();
    const model = rows[0]!;

    const result = await billUsage(provider!.id, model.slug, null, model);
    expect(result).toBeNull();

    const logs = await db.select().from(usageLogs);
    expect(logs).toHaveLength(0);
  });

  it("billUsage logs cost when price is zero without deducting", async () => {
    const provider = await createProvider({ ...baseProvider, balance: 50 });
    const rows = await db
      .insert(models)
      .values({
        providerId: provider!.id,
        slug: "gpt-4o",
        upstreamName: "gpt-4o",
        inputPrice: 0,
        outputPrice: 0,
      })
      .returning();
    const model = rows[0]!;

    await billUsage(
      provider!.id,
      model.slug,
      { promptTokens: 1000, completionTokens: 2000 },
      model
    );

    const updated = await getProviderById(provider!.id);
    expect(updated?.balance).toBe(50);

    const logs = await db.select().from(usageLogs);
    expect(logs).toHaveLength(1);
    expect(logs[0].cost).toBe(0);
  });
});
