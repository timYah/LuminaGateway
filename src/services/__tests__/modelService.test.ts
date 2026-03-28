import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getDb, type SqliteDatabase } from "../../db";
import { modelPriorities, providers } from "../../db/schema";
import { getActiveProvidersByModel } from "../modelService";
import { configureTestDatabase } from "../../test/testDb";

configureTestDatabase("model");

const db = getDb() as SqliteDatabase;

beforeAll(() => {
  migrate(db, { migrationsFolder: "drizzle" });
});

beforeEach(() => {
  db.delete(providers).run();
  db.delete(modelPriorities).run();
});

async function seedProviders() {
  return await db
    .insert(providers)
    .values([
      {
        name: "Provider A",
        protocol: "openai",
        baseUrl: "https://a.example.com/v1",
        apiKey: "sk-a",
        balance: 100,
        isActive: true,
        priority: 2,
      },
      {
        name: "Provider B",
        protocol: "openai",
        baseUrl: "https://b.example.com/v1",
        apiKey: "sk-b",
        balance: 50,
        isActive: true,
        priority: 1,
      },
      {
        name: "Provider C",
        protocol: "openai",
        baseUrl: "https://c.example.com/v1",
        apiKey: "sk-c",
        balance: 100,
        isActive: true,
        priority: 1,
      },
      {
        name: "Provider D",
        protocol: "openai",
        baseUrl: "https://d.example.com/v1",
        apiKey: "sk-d",
        balance: 0,
        isActive: true,
        priority: 1,
      },
    ])
    .returning({ id: providers.id, name: providers.name });
}

describe("modelService", () => {
  it("getActiveProvidersByModel sorts by priority desc then id", async () => {
    await seedProviders();

    const list = await getActiveProvidersByModel("gpt-4o");
    expect(list.map((p) => p.name)).toEqual([
      "Provider A",
      "Provider B",
      "Provider C",
      "Provider D",
    ]);
  });

  it("includes model-level priority when configured", async () => {
    const inserted = await seedProviders();
    const providerB = inserted.find((row) => row.name === "Provider B");
    expect(providerB).toBeDefined();
    await db.insert(modelPriorities).values({
      providerId: providerB!.id,
      modelSlug: "gpt-4o",
      priority: 7,
    });

    const list = await getActiveProvidersByModel("gpt-4o");
    const row = list.find((item) => item.id === providerB!.id);
    expect(row?.modelPriority).toBe(7);
  });

  it("matches wildcard model priorities with specificity and exact overrides", async () => {
    const inserted = await seedProviders();
    const providerB = inserted.find((row) => row.name === "Provider B");
    expect(providerB).toBeDefined();

    await db.insert(modelPriorities).values([
      {
        providerId: providerB!.id,
        modelSlug: "gpt-5*",
        priority: 9,
      },
      {
        providerId: providerB!.id,
        modelSlug: "gpt-5.4*",
        priority: 2,
      },
    ]);

    const wildcardList = await getActiveProvidersByModel("gpt-5.4-xhigh");
    const wildcardRow = wildcardList.find((item) => item.id === providerB!.id);
    expect(wildcardRow?.modelPriority).toBe(2);

    await db.insert(modelPriorities).values({
      providerId: providerB!.id,
      modelSlug: "gpt-5.4-xhigh",
      priority: 5,
    });

    const exactList = await getActiveProvidersByModel("gpt-5.4-xhigh");
    const exactRow = exactList.find((item) => item.id === providerB!.id);
    expect(exactRow?.modelPriority).toBe(5);
  });
});
