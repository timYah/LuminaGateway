import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createApp } from "../../app";
import { getDb, type SqliteDatabase } from "../../db";
import { providers } from "../../db/schema";
import { createProvider } from "../../services/providerService";
import { configureTestDatabase } from "../../test/testDb";

configureTestDatabase("admin-update");
process.env.GATEWAY_API_KEY = "test-key";

const db = getDb() as SqliteDatabase;
const app = createApp();
const authHeader = { Authorization: "Bearer test-key" };

beforeAll(() => {
  migrate(db, { migrationsFolder: "drizzle" });
});

beforeEach(() => {
  db.delete(providers).run();
});

describe("admin provider update", () => {
  it("updates provider fields", async () => {
    const provider = await createProvider({
      name: "Update Provider",
      protocol: "openai",
      baseUrl: "https://example.com",
      apiKey: "sk-update",
      balance: 5,
      isActive: true,
      priority: 1,
    });

    const res = await app.request(`/admin/providers/${provider!.id}`, {
      method: "PATCH",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ balance: 25 }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.provider.balance).toBe(25);
  });

  it("returns 404 for missing provider", async () => {
    const res = await app.request("/admin/providers/9999", {
      method: "PATCH",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ priority: 2 }),
    });

    expect(res.status).toBe(404);
  });

  it("supports partial updates", async () => {
    const provider = await createProvider({
      name: "Partial Provider",
      protocol: "openai",
      baseUrl: "https://example.com",
      apiKey: "sk-partial",
      balance: 5,
      isActive: true,
      priority: 1,
    });

    const res = await app.request(`/admin/providers/${provider!.id}`, {
      method: "PATCH",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ priority: 4 }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.provider.priority).toBe(4);
  });
});
