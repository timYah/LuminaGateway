import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createApp } from "../../app";
import { getDb, type SqliteDatabase } from "../../db";
import { modelPriorities, providers } from "../../db/schema";
import { configureTestDatabase } from "../../test/testDb";

configureTestDatabase("admin-model-priorities");
process.env.GATEWAY_API_KEY = "test-key";

const db = getDb() as SqliteDatabase;
const app = createApp();
const authHeader = { Authorization: "Bearer test-key" };

beforeAll(() => {
  migrate(db, { migrationsFolder: "drizzle" });
});

beforeEach(() => {
  migrate(db, { migrationsFolder: "drizzle" });
  db.delete(modelPriorities).run();
  db.delete(providers).run();
});

async function seedProvider(name = "Primary Provider") {
  const rows = await db
    .insert(providers)
    .values({
      name,
      protocol: "openai",
      baseUrl: "https://example.com/v1",
      apiKey: "sk-test",
      balance: 10,
      priority: 1,
      isActive: true,
    })
    .returning();
  return rows[0]!;
}

describe("admin model priorities", () => {
  it("returns empty list when model priorities table is missing", async () => {
    db.run("DROP TABLE IF EXISTS model_priorities");

    const res = await app.request("/admin/model-priorities", {
      headers: authHeader,
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.modelPriorities).toEqual([]);

    db.run(
      "CREATE TABLE IF NOT EXISTS model_priorities (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, provider_id integer NOT NULL, model_slug text NOT NULL, priority integer NOT NULL DEFAULT 0, created_at integer NOT NULL DEFAULT (unixepoch()), updated_at integer NOT NULL DEFAULT (unixepoch()), FOREIGN KEY (provider_id) REFERENCES providers(id) ON UPDATE NO ACTION ON DELETE CASCADE)"
    );
    db.run(
      "CREATE UNIQUE INDEX IF NOT EXISTS model_priorities_provider_model_unique ON model_priorities (provider_id, model_slug)"
    );
    db.run(
      "CREATE INDEX IF NOT EXISTS model_priorities_model_slug_idx ON model_priorities (model_slug)"
    );
  });

  it("creates and lists model priorities", async () => {
    const provider = await seedProvider();
    const res = await app.request("/admin/model-priorities", {
      method: "POST",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({
        providerId: provider.id,
        modelSlug: "gpt-4o",
        priority: 8,
      }),
    });

    expect(res.status).toBe(201);

    const list = await app.request("/admin/model-priorities", {
      headers: authHeader,
    });
    expect(list.status).toBe(200);
    const body = await list.json();
    expect(body.modelPriorities).toHaveLength(1);
    expect(body.modelPriorities[0].providerName).toBe(provider.name);
  });

  it("updates and deletes model priorities", async () => {
    const provider = await seedProvider();
    const created = await app.request("/admin/model-priorities", {
      method: "POST",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({
        providerId: provider.id,
        modelSlug: "gpt-4o",
        priority: 3,
      }),
    });
    const createdBody = await created.json();

    const update = await app.request(
      `/admin/model-priorities/${createdBody.modelPriority.id}`,
      {
        method: "PATCH",
        headers: { ...authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({ priority: 9 }),
      }
    );
    expect(update.status).toBe(200);
    const updateBody = await update.json();
    expect(updateBody.modelPriority.priority).toBe(9);

    const deleted = await app.request(
      `/admin/model-priorities/${createdBody.modelPriority.id}`,
      {
        method: "DELETE",
        headers: authHeader,
      }
    );
    expect(deleted.status).toBe(200);
  });

  it("exports and imports model priorities", async () => {
    const provider = await seedProvider("Exporter");
    await db.insert(modelPriorities).values({
      providerId: provider.id,
      modelSlug: "gpt-4o",
      priority: 6,
    });

    const exported = await app.request("/admin/config/export", {
      headers: authHeader,
    });
    expect(exported.status).toBe(200);
    const exportedBody = await exported.json();
    expect(exportedBody.models).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          providerId: provider.id,
          providerName: provider.name,
          modelSlug: "gpt-4o",
          priority: 6,
        }),
      ])
    );

    const imported = await app.request("/admin/config/import", {
      method: "POST",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "replace",
        providers: [
          {
            name: "Importer",
            protocol: "openai",
            baseUrl: "https://import.example.com/v1",
            apiKey: "sk-import",
            balance: 0,
            priority: 1,
          },
        ],
        models: [
          {
            providerName: "Importer",
            modelSlug: "gpt-4o-mini",
            priority: 4,
          },
        ],
      }),
    });
    expect(imported.status).toBe(200);
    const importedBody = await imported.json();
    expect(importedBody.importedModels).toBe(1);
    expect(importedBody.ignoredModels).toBe(0);
  });

  it("overwrites existing model priorities when configured", async () => {
    const imported = await app.request("/admin/config/import", {
      method: "POST",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "replace",
        modelConflictPolicy: "overwrite",
        providers: [
          {
            name: "Override",
            protocol: "openai",
            baseUrl: "https://override.example.com/v1",
            apiKey: "sk-override",
            balance: 0,
            priority: 1,
          },
        ],
        models: [
          {
            providerName: "Override",
            modelSlug: "gpt-4o",
            priority: 2,
          },
          {
            providerName: "Override",
            modelSlug: "gpt-4o",
            priority: 10,
          },
        ],
      }),
    });

    expect(imported.status).toBe(200);
    const rows = await db.select().from(modelPriorities);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.priority).toBe(10);
  });
});
