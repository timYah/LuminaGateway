import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getDb, type SqliteDatabase } from "../../db";
import { providers } from "../../db/schema";
import { CircuitBreaker } from "../circuitBreaker";
import { ProviderRecoveryService } from "../providerRecoveryService";
import { NoProviderAvailableError, RouterService } from "../routerService";
import { configureTestDatabase } from "../../test/testDb";

configureTestDatabase("router");

const db = getDb() as SqliteDatabase;

beforeAll(() => {
  migrate(db, { migrationsFolder: "drizzle" });
});

beforeEach(() => {
  db.delete(providers).run();
});

afterEach(() => {
  delete process.env.ROUTING_STRATEGY;
  delete process.env.PROVIDER_WEIGHTS;
  vi.restoreAllMocks();
});

async function seed() {
  const inserted = await db
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
        balance: 100,
        isActive: true,
        priority: 1,
      },
      {
        name: "Provider C",
        protocol: "openai",
        baseUrl: "https://c.example.com/v1",
        apiKey: "sk-c",
        balance: 50,
        isActive: true,
        priority: 1,
      },
    ])
    .returning({ id: providers.id, name: providers.name });

  return inserted;
}

describe("routerService", () => {
  it("selects provider by priority asc then id", async () => {
    await seed();
    const router = new RouterService(new CircuitBreaker());
    const selected = await router.selectProvider("gpt-4o");
    expect(selected.name).toBe("Provider B");
  });

  it("filters circuit-open providers", async () => {
    const inserted = await seed();
    const breaker = new CircuitBreaker();
    const router = new RouterService(breaker);
    breaker.open(inserted[1].id, 1000);
    const selected = await router.selectProvider("gpt-4o");
    expect(selected.name).toBe("Provider C");
  });

  it("filters recovering providers", async () => {
    const inserted = await seed();
    const recovery = new ProviderRecoveryService();
    recovery.markRecovering({
      providerId: inserted[1].id,
      errorType: "server",
      probeModel: "gpt-4o",
    });
    const router = new RouterService(new CircuitBreaker(), recovery);

    const selected = await router.selectProvider("gpt-4o");

    expect(selected.name).toBe("Provider C");
  });

  it("getAllCandidates returns sorted filtered list", async () => {
    await seed();
    const router = new RouterService(new CircuitBreaker());
    const list = await router.getAllCandidates("gpt-4o");
    expect(list.map((p) => p.name)).toEqual([
      "Provider B",
      "Provider C",
      "Provider A",
    ]);
  });

  it("round robin rotates candidates", async () => {
    process.env.ROUTING_STRATEGY = "round_robin";
    await seed();
    const router = new RouterService(new CircuitBreaker());
    const first = await router.getAllCandidates("gpt-4o");
    const second = await router.getAllCandidates("gpt-4o");
    expect(first.map((p) => p.name)).toEqual([
      "Provider B",
      "Provider C",
      "Provider A",
    ]);
    expect(second.map((p) => p.name)).toEqual([
      "Provider C",
      "Provider A",
      "Provider B",
    ]);
  });

  it("weighted strategy promotes higher-weight providers", async () => {
    process.env.ROUTING_STRATEGY = "weighted";
    process.env.PROVIDER_WEIGHTS = JSON.stringify({
      "Provider C": 10,
      "Provider B": 1,
      "Provider A": 1,
    });
    await seed();
    const router = new RouterService(new CircuitBreaker());
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const ordered = await router.getAllCandidates("gpt-4o");
    expect(ordered.map((p) => p.name)).toEqual([
      "Provider C",
      "Provider B",
      "Provider A",
    ]);
  });

  it("throws NoProviderAvailableError when none available", async () => {
    const router = new RouterService(new CircuitBreaker());
    await expect(router.selectProvider("missing-model")).rejects.toBeInstanceOf(
      NoProviderAvailableError
    );
  });
});
