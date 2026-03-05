import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getDb, type SqliteDatabase } from "../../db";
import { models, providers } from "../../db/schema";
import {
  getActiveProvidersByModel,
  getModelByProviderAndSlug,
  getModelsBySlug,
} from "../modelService";

process.env.DATABASE_TYPE = "sqlite";
process.env.DATABASE_URL = "file:./test-model.db";

const db = getDb() as SqliteDatabase;

beforeAll(() => {
  migrate(db, { migrationsFolder: "drizzle" });
});

beforeEach(() => {
  db.delete(models).run();
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
  it("getModelsBySlug returns models with provider info", async () => {
    const inserted = await seedProviders();
    const [a, b] = inserted;
    await db.insert(models).values([
      {
        providerId: a.id,
        slug: "gpt-4o",
        upstreamName: "gpt-4o",
        inputPrice: 5,
        outputPrice: 15,
      },
      {
        providerId: b.id,
        slug: "gpt-4o",
        upstreamName: "gpt-4o",
        inputPrice: 5,
        outputPrice: 15,
      },
    ]);

    const rows = await getModelsBySlug("gpt-4o");
    expect(rows).toHaveLength(2);
    expect(rows[0].providers.name).toBeDefined();
  });

  it("getActiveProvidersByModel sorts by balance desc then priority asc", async () => {
    const inserted = await seedProviders();
    for (const provider of inserted) {
      await db.insert(models).values({
        providerId: provider.id,
        slug: "gpt-4o",
        upstreamName: "gpt-4o",
        inputPrice: 5,
        outputPrice: 15,
      });
    }

    const list = await getActiveProvidersByModel("gpt-4o");
    expect(list.map((p) => p.name)).toEqual([
      "Provider C",
      "Provider A",
      "Provider B",
    ]);
  });

  it("getModelByProviderAndSlug returns model pricing", async () => {
    const inserted = await seedProviders();
    const provider = inserted[0];
    await db.insert(models).values({
      providerId: provider.id,
      slug: "gpt-4o-mini",
      upstreamName: "gpt-4o-mini",
      inputPrice: 0.15,
      outputPrice: 0.6,
    });

    const model = await getModelByProviderAndSlug(provider.id, "gpt-4o-mini");
    expect(model?.upstreamName).toBe("gpt-4o-mini");
  });
});
