import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createApp } from "../../app";
import { getDb, type SqliteDatabase } from "../../db";
import { providers } from "../../db/schema";
import { gatewayCircuitBreaker } from "../../services/gatewayService";
import { providerRecoveryService } from "../../services/providerRecoveryService";
import { createProvider } from "../../services/providerService";
import { configureTestDatabase } from "../../test/testDb";

configureTestDatabase("admin-breakers");
process.env.GATEWAY_API_KEY = "test-key";

const db = getDb() as SqliteDatabase;
const app = createApp();
const authHeader = { Authorization: "Bearer test-key" };

beforeAll(() => {
  migrate(db, { migrationsFolder: "drizzle" });
});

beforeEach(() => {
  db.delete(providers).run();
  gatewayCircuitBreaker.reset(1);
  gatewayCircuitBreaker.reset(2);
  providerRecoveryService.resetAll();
  providerRecoveryService.stop();
});

describe("admin circuit breakers", () => {
  it("lists open circuit breakers", async () => {
    const provider = await createProvider({
      name: "Breaker Provider",
      protocol: "openai",
      baseUrl: "https://example.com",
      apiKey: "sk-breaker",
      balance: 0,
      isActive: true,
      priority: 1,
    });
    gatewayCircuitBreaker.open(provider!.id, 60_000);

    const res = await app.request("/admin/circuit-breakers", {
      headers: authHeader,
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.breakers).toHaveLength(1);
    expect(body.breakers[0]).toMatchObject({
      providerId: provider!.id,
      name: "Breaker Provider",
      protocol: "openai",
    });
    expect(body.breakers[0].remainingMs).toBeGreaterThan(0);
  });

  it("returns empty when no breakers are open", async () => {
    const res = await app.request("/admin/circuit-breakers", {
      headers: authHeader,
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.breakers).toEqual([]);
  });

  it("lists providers that are recovering even after cooldown expires", async () => {
    const provider = await createProvider({
      name: "Recovering Provider",
      protocol: "openai",
      baseUrl: "https://example.com",
      apiKey: "sk-recovering",
      balance: 0,
      isActive: true,
      priority: 1,
    });
    providerRecoveryService.markRecovering({
      providerId: provider!.id,
      errorType: "server",
      probeModel: "gpt-4o",
    });

    const res = await app.request("/admin/circuit-breakers", {
      headers: authHeader,
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.breakers).toHaveLength(1);
    expect(body.breakers[0]).toMatchObject({
      providerId: provider!.id,
      state: "recovering",
      triggerErrorType: "server",
      probeModel: "gpt-4o",
    });
    expect(body.breakers[0].remainingMs).toBeGreaterThan(0);
  });

  it("resets a circuit breaker via admin", async () => {
    const provider = await createProvider({
      name: "Reset Provider",
      protocol: "openai",
      baseUrl: "https://example.com",
      apiKey: "sk-reset",
      balance: 0,
      isActive: true,
      priority: 1,
    });
    gatewayCircuitBreaker.open(provider!.id, 60_000);
    expect(gatewayCircuitBreaker.isOpen(provider!.id)).toBe(true);

    const res = await app.request(`/admin/providers/${provider!.id}/reset`, {
      method: "POST",
      headers: authHeader,
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.provider.id).toBe(provider!.id);
    expect(gatewayCircuitBreaker.isOpen(provider!.id)).toBe(false);
  });

  it("returns 404 when resetting missing provider", async () => {
    const res = await app.request("/admin/providers/9999/reset", {
      method: "POST",
      headers: authHeader,
    });

    expect(res.status).toBe(404);
  });
});
