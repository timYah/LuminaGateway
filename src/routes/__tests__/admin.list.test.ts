import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createApp } from "../../app";
import { getDb, type SqliteDatabase } from "../../db";
import { providers } from "../../db/schema";
import { createProvider } from "../../services/providerService";

process.env.DATABASE_TYPE = "sqlite";
process.env.DATABASE_URL = "file:./test-admin.db";
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

describe("admin providers list", () => {
  it("rejects unauthorized requests", async () => {
    const res = await app.request("/admin/providers");
    expect(res.status).toBe(401);
  });

  it("returns providers for authorized requests", async () => {
    await createProvider({
      name: "Admin Provider",
      protocol: "openai",
      baseUrl: "https://example.com",
      apiKey: "sk-admin",
      balance: 5,
      isActive: true,
      priority: 1,
    });

    const res = await app.request("/admin/providers", {
      headers: authHeader,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.providers).toHaveLength(1);
    expect(body.providers[0].name).toBe("Admin Provider");
  });
});
