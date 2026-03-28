import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getDb, type SqliteDatabase } from "../../db";
import { modelPriorities, providers } from "../../db/schema";
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
  db.delete(modelPriorities).run();
});

afterEach(() => {
  delete process.env.ROUTING_STRATEGY;
  delete process.env.PROVIDER_WEIGHTS;
  vi.restoreAllMocks();
});

async function seed(priorities: [number, number, number] = [2, 1, 1]) {
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
        priority: priorities[0],
      },
      {
        name: "Provider B",
        protocol: "openai",
        baseUrl: "https://b.example.com/v1",
        apiKey: "sk-b",
        balance: 100,
        isActive: true,
        priority: priorities[1],
      },
      {
        name: "Provider C",
        protocol: "openai",
        baseUrl: "https://c.example.com/v1",
        apiKey: "sk-c",
        balance: 50,
        isActive: true,
        priority: priorities[2],
      },
    ])
    .returning({ id: providers.id, name: providers.name });

  return inserted;
}

describe("routerService", () => {
  it("selects provider by priority desc then id", async () => {
    await seed();
    const router = new RouterService(new CircuitBreaker());
    const selected = await router.selectProvider("gpt-4o");
    expect(selected.name).toBe("Provider A");
  });

  it("uses model-level priority when configured", async () => {
    const inserted = await seed();
    await db.insert(modelPriorities).values({
      providerId: inserted[1].id,
      modelSlug: "gpt-4o",
      priority: 5,
    });
    const router = new RouterService(new CircuitBreaker());
    const selected = await router.selectProvider("gpt-4o");
    expect(selected.name).toBe("Provider B");
  });

  it("filters circuit-open providers", async () => {
    const inserted = await seed();
    const breaker = new CircuitBreaker();
    const router = new RouterService(breaker);
    breaker.open(inserted[0].id, 1000);
    const selected = await router.selectProvider("gpt-4o");
    expect(selected.name).toBe("Provider B");
  });

  it("keeps provider available for other models when model-scoped breaker is open", async () => {
    const inserted = await seed();
    const breaker = new CircuitBreaker();
    const router = new RouterService(breaker);
    breaker.open(inserted[0].id, 1000, "gpt-4o");

    const blocked = await router.selectProvider("gpt-4o");
    const allowed = await router.selectProvider("gpt-4.1");

    expect(blocked.name).toBe("Provider B");
    expect(allowed.name).toBe("Provider A");
  });

  it("filters recovering providers", async () => {
    const inserted = await seed();
    const recovery = new ProviderRecoveryService();
    recovery.markRecovering({
      providerId: inserted[0].id,
      errorType: "server",
      probeModel: "gpt-4o",
    });
    const router = new RouterService(new CircuitBreaker(), recovery);

    const selected = await router.selectProvider("gpt-4o");

    expect(selected.name).toBe("Provider B");
  });

  it("getAllCandidates returns sorted filtered list", async () => {
    await seed();
    const router = new RouterService(new CircuitBreaker());
    const list = await router.getAllCandidates("gpt-4o");
    expect(list.map((p) => p.name)).toEqual([
      "Provider A",
      "Provider B",
      "Provider C",
    ]);
  });

  it("round robin rotates candidates", async () => {
    process.env.ROUTING_STRATEGY = "round_robin";
    await seed([1, 1, 1]);
    const router = new RouterService(new CircuitBreaker());
    const first = await router.getAllCandidates("gpt-4o");
    const second = await router.getAllCandidates("gpt-4o");
    expect(first.map((p) => p.name)).toEqual([
      "Provider A",
      "Provider B",
      "Provider C",
    ]);
    expect(second.map((p) => p.name)).toEqual([
      "Provider B",
      "Provider C",
      "Provider A",
    ]);
  });

  it("round robin keeps higher-priority providers first", async () => {
    process.env.ROUTING_STRATEGY = "round_robin";
    await seed();
    const router = new RouterService(new CircuitBreaker());
    const first = await router.getAllCandidates("gpt-4o");
    const second = await router.getAllCandidates("gpt-4o");
    expect(first.map((p) => p.name)).toEqual([
      "Provider A",
      "Provider B",
      "Provider C",
    ]);
    expect(second.map((p) => p.name)).toEqual([
      "Provider A",
      "Provider B",
      "Provider C",
    ]);
  });

  it("weighted strategy promotes higher-weight providers", async () => {
    process.env.ROUTING_STRATEGY = "weighted";
    process.env.PROVIDER_WEIGHTS = JSON.stringify({
      "Provider C": 10,
      "Provider B": 1,
      "Provider A": 1,
    });
    await seed([1, 1, 1]);
    const router = new RouterService(new CircuitBreaker());
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const ordered = await router.getAllCandidates("gpt-4o");
    expect(ordered.map((p) => p.name)).toEqual([
      "Provider C",
      "Provider A",
      "Provider B",
    ]);
  });

  it("weighted strategy keeps higher-priority providers first", async () => {
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
      "Provider A",
      "Provider B",
      "Provider C",
    ]);
  });

  it("throws NoProviderAvailableError when none available", async () => {
    const router = new RouterService(new CircuitBreaker());
    await expect(router.selectProvider("missing-model")).rejects.toBeInstanceOf(
      NoProviderAvailableError
    );
  });
});
