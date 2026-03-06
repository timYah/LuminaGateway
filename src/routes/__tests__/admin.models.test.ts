import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createApp } from "../../app";
import { getDb, type SqliteDatabase } from "../../db";
import { models, providers } from "../../db/schema";

process.env.DATABASE_TYPE = "sqlite";
process.env.DATABASE_URL = "file:./test-admin-models.db";
process.env.GATEWAY_API_KEY = "test-key";

const db = getDb() as SqliteDatabase;
const app = createApp();
const authHeader = { Authorization: "Bearer test-key" };

beforeAll(() => {
  migrate(db, { migrationsFolder: "drizzle" });
});

beforeEach(() => {
  db.delete(models).run();
  db.delete(providers).run();
});

const createProvider = async (name: string) => {
  const rows = await db
    .insert(providers)
    .values({
      name,
      protocol: "openai",
      baseUrl: "https://example.com/v1",
      apiKey: "sk-test",
      balance: 10,
      isActive: true,
      priority: 1,
    })
    .returning();
  return rows[0]!;
};

describe("admin model mappings", () => {
  it("creates and lists model mappings", async () => {
    const provider = await createProvider("Provider A");

    const res = await app.request("/admin/models", {
      method: "POST",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({
        providerId: provider.id,
        slug: "gpt-4o",
        upstreamName: "gpt-4o",
        inputPrice: 5,
        outputPrice: 15,
      }),
    });

    expect(res.status).toBe(201);

    const listRes = await app.request("/admin/models", {
      headers: authHeader,
    });
    const body = await listRes.json();
    expect(body.models).toHaveLength(1);
    expect(body.models[0].providerName).toBe(provider.name);
  });

  it("filters by providerId", async () => {
    const providerA = await createProvider("Provider A");
    const providerB = await createProvider("Provider B");

    await db.insert(models).values([
      {
        providerId: providerA.id,
        slug: "gpt-4o",
        upstreamName: "gpt-4o",
        inputPrice: 5,
        outputPrice: 15,
      },
      {
        providerId: providerB.id,
        slug: "claude-sonnet-4-20250514",
        upstreamName: "claude-sonnet-4-20250514",
        inputPrice: 3,
        outputPrice: 15,
      },
    ]);

    const res = await app.request(`/admin/models?providerId=${providerA.id}`, {
      headers: authHeader,
    });
    const body = await res.json();
    expect(body.models).toHaveLength(1);
    expect(body.models[0].providerId).toBe(providerA.id);
  });

  it("updates a model mapping", async () => {
    const provider = await createProvider("Provider A");
    const rows = await db.insert(models).values({
      providerId: provider.id,
      slug: "gpt-4o",
      upstreamName: "gpt-4o",
      inputPrice: 5,
      outputPrice: 15,
    }).returning();
    const model = rows[0]!;

    const res = await app.request(`/admin/models/${model.id}`, {
      method: "PATCH",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({
        upstreamName: "gpt-4o-mini",
        inputPrice: 0.15,
        outputPrice: 0.6,
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.model.upstreamName).toBe("gpt-4o-mini");
  });
});
