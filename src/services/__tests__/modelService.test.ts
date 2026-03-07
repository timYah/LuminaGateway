import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getDb, type SqliteDatabase } from "../../db";
import { providers } from "../../db/schema";
import { getActiveProvidersByModel } from "../modelService";
import { configureTestDatabase } from "../../test/testDb";

configureTestDatabase("model");

const db = getDb() as SqliteDatabase;

beforeAll(() => {
  migrate(db, { migrationsFolder: "drizzle" });
});

beforeEach(() => {
  db.delete(providers).run();
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
  it("getActiveProvidersByModel sorts by priority asc then id", async () => {
    await seedProviders();

    const list = await getActiveProvidersByModel("gpt-4o");
    expect(list.map((p) => p.name)).toEqual([
      "Provider B",
      "Provider C",
      "Provider D",
      "Provider A",
    ]);
  });
});
