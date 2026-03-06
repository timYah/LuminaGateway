import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getDb, type SqliteDatabase } from "../../db";
import { models, providers } from "../../db/schema";
import {
  createProvider,
  deleteProvider,
  deactivateProvider,
  deductBalance,
  getAllProviders,
  getProviderById,
  updateProvider,
} from "../providerService";

process.env.DATABASE_TYPE = "sqlite";
process.env.DATABASE_URL = "file:./test-provider.db";

const db = getDb() as SqliteDatabase;

beforeAll(() => {
  migrate(db, { migrationsFolder: "drizzle" });
});

beforeEach(() => {
  db.delete(models).run();
  db.delete(providers).run();
});

const baseProvider = {
  name: "Test Provider",
  protocol: "openai" as const,
  baseUrl: "https://example.com/v1",
  apiKey: "sk-test",
  balance: 10,
  isActive: true,
  priority: 1,
};

describe("providerService", () => {
  it("getAllProviders returns all providers", async () => {
    await createProvider(baseProvider);
    const list = await getAllProviders();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("Test Provider");
  });

  it("getProviderById returns provider or null", async () => {
    const created = await createProvider(baseProvider);
    const found = await getProviderById(created!.id);
    expect(found?.id).toBe(created!.id);
    const missing = await getProviderById(9999);
    expect(missing).toBeNull();
  });

  it("updateProvider updates fields", async () => {
    const created = await createProvider(baseProvider);
    const updated = await updateProvider(created!.id, { balance: 25 });
    expect(updated?.balance).toBe(25);
  });

  it("deactivateProvider sets isActive false", async () => {
    const created = await createProvider(baseProvider);
    const updated = await deactivateProvider(created!.id);
    expect(updated?.isActive).toBe(false);
  });

  it("deductBalance subtracts amount", async () => {
    const created = await createProvider({ ...baseProvider, balance: 100 });
    const updated = await deductBalance(created!.id, 12.5);
    expect(updated?.balance).toBeCloseTo(87.5);
  });

  it("deleteProvider removes the provider", async () => {
    const created = await createProvider(baseProvider);
    const removed = await deleteProvider(created!.id);
    expect(removed?.id).toBe(created!.id);
    const list = await getAllProviders();
    expect(list).toHaveLength(0);
  });
});
