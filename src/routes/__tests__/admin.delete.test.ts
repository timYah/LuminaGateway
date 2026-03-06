import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createApp } from "../../app";
import { getDb, type SqliteDatabase } from "../../db";
import { providers } from "../../db/schema";
import { createProvider } from "../../services/providerService";

process.env.DATABASE_TYPE = "sqlite";
process.env.DATABASE_URL = "file:./test-admin-delete.db";
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

describe("admin provider delete", () => {
  it("deletes provider", async () => {
    const provider = await createProvider({
      name: "Delete Provider",
      protocol: "openai",
      baseUrl: "https://example.com",
      apiKey: "sk-delete",
      balance: 5,
      isActive: true,
      priority: 1,
    });

    const res = await app.request(`/admin/providers/${provider!.id}`, {
      method: "DELETE",
      headers: authHeader,
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.provider.id).toBe(provider!.id);

    const listRes = await app.request("/admin/providers", {
      headers: authHeader,
    });
    const listBody = await listRes.json();
    expect(listBody.providers).toHaveLength(0);
  });

  it("returns 404 for missing provider", async () => {
    const res = await app.request("/admin/providers/9999", {
      method: "DELETE",
      headers: authHeader,
    });

    expect(res.status).toBe(404);
  });
});
