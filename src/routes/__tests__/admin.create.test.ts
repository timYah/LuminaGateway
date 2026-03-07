import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createApp } from "../../app";
import { getDb, type SqliteDatabase } from "../../db";
import { providers } from "../../db/schema";
import { configureTestDatabase } from "../../test/testDb";

configureTestDatabase("admin-create");
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

describe("admin provider create", () => {
  it("creates provider with valid payload", async () => {
    const res = await app.request("/admin/providers", {
      method: "POST",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Created Provider",
        protocol: "openai",
        baseUrl: "https://example.com",
        apiKey: "sk-created",
        balance: 10,
        priority: 2,
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.provider.name).toBe("Created Provider");

    const rows = await db.select().from(providers);
    expect(rows).toHaveLength(1);
  });

  it("rejects invalid payload", async () => {
    const res = await app.request("/admin/providers", {
      method: "POST",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Missing fields" }),
    });

    expect(res.status).toBe(400);
  });

  it("accepts new-api protocol", async () => {
    const res = await app.request("/admin/providers", {
      method: "POST",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "New API Proxy",
        protocol: "new-api",
        baseUrl: "https://newapi.example.com/v1",
        apiKey: "sk-newapi",
        balance: 5,
        priority: 3,
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.provider.protocol).toBe("new-api");
  });
});
