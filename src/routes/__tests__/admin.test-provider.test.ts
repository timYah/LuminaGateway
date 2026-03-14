import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { APICallError } from "ai";
import { createApp } from "../../app";
import { getDb, type SqliteDatabase } from "../../db";
import { providers } from "../../db/schema";
import { gatewayCircuitBreaker } from "../../services/gatewayService";
import { providerRecoveryService } from "../../services/providerRecoveryService";
import { createProvider } from "../../services/providerService";
import { configureTestDatabase } from "../../test/testDb";

configureTestDatabase("admin-test-provider");
process.env.GATEWAY_API_KEY = "test-key";

vi.mock("../../services/upstreamService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/upstreamService")>();
  return {
    ...actual,
    callUpstreamNonStreaming: vi.fn(),
  };
});

import { callUpstreamNonStreaming } from "../../services/upstreamService";
const mockedCall = vi.mocked(callUpstreamNonStreaming);

const db = getDb() as SqliteDatabase;
const app = createApp();
const authHeader = { Authorization: "Bearer test-key" };

beforeAll(() => {
  migrate(db, { migrationsFolder: "drizzle" });
});

beforeEach(() => {
  db.delete(providers).run();
  mockedCall.mockReset();
  gatewayCircuitBreaker.reset(1);
  gatewayCircuitBreaker.reset(2);
  gatewayCircuitBreaker.reset(3);
  gatewayCircuitBreaker.reset(4);
  providerRecoveryService.resetAll();
  providerRecoveryService.stop();
});

describe("POST /admin/providers/:id/test", () => {
  it("returns success with latencyMs when upstream responds", async () => {
    const provider = await createProvider({
      name: "Test Provider",
      protocol: "openai",
      baseUrl: "https://api.example.com",
      apiKey: "sk-test",
      balance: 10,
      isActive: true,
      priority: 1,
    });

    mockedCall.mockResolvedValue({
      result: {} as never,
      usage: { promptTokens: 1, completionTokens: 1 },
    });

    const res = await app.request(`/admin/providers/${provider!.id}/test`, {
      method: "POST",
      headers: authHeader,
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.latencyMs).toBeGreaterThanOrEqual(0);
    expect(body.model).toBe("gpt-4o");
  });

  it("honors custom model slug in query", async () => {
    const provider = await createProvider({
      name: "Custom Model Provider",
      protocol: "openai",
      baseUrl: "https://api.example.com",
      apiKey: "sk-test",
      balance: 10,
      isActive: true,
      priority: 1,
    });

    mockedCall.mockResolvedValue({
      result: {} as never,
      usage: { promptTokens: 1, completionTokens: 1 },
    });

    const res = await app.request(`/admin/providers/${provider!.id}/test?model=claude-test`, {
      method: "POST",
      headers: authHeader,
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.model).toBe("claude-test");
  });

  it("returns error classification on upstream failure", async () => {
    const provider = await createProvider({
      name: "Failing Provider",
      protocol: "openai",
      baseUrl: "https://api.example.com",
      apiKey: "sk-bad",
      balance: 10,
      isActive: true,
      priority: 1,
    });

    mockedCall.mockRejectedValue(new Error("upstream failed"));

    const res = await app.request(`/admin/providers/${provider!.id}/test`, {
      method: "POST",
      headers: authHeader,
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.errorType).toBe("unknown");
    expect(body.message).toBe("upstream failed");
  });

  it("restores a recovering provider when the manual test succeeds", async () => {
    const provider = await createProvider({
      name: "Recovering Provider",
      protocol: "openai",
      baseUrl: "https://api.example.com",
      apiKey: "sk-recover",
      balance: 10,
      isActive: true,
      priority: 1,
    });
    providerRecoveryService.markRecovering({
      providerId: provider!.id,
      errorType: "server",
      probeModel: "gpt-4o",
    });
    gatewayCircuitBreaker.open(provider!.id, 30_000, "gpt-4o");
    mockedCall.mockResolvedValue({
      result: {} as never,
      usage: { promptTokens: 1, completionTokens: 1 },
    });

    const res = await app.request(`/admin/providers/${provider!.id}/test`, {
      method: "POST",
      headers: authHeader,
    });

    expect(res.status).toBe(200);
    expect(providerRecoveryService.isRecovering(provider!.id)).toBe(false);
    expect(gatewayCircuitBreaker.isOpen(provider!.id)).toBe(false);
  });

  it("returns model_not_found for new-api providers when upstream reports an unsupported model", async () => {
    const provider = await createProvider({
      name: "Missing Model Provider",
      protocol: "new-api",
      baseUrl: "https://api.example.com",
      apiKey: "sk-missing",
      balance: 10,
      isActive: true,
      priority: 1,
    });

    const error = new APICallError({
      message: "Bad Request",
      url: "https://api.example.com",
      requestBodyValues: {},
      statusCode: 400,
    });
    Object.assign(error, {
      responseBody: JSON.stringify({ error: "端点/openai未配置模型gpt-4o" }),
    });
    mockedCall.mockRejectedValue(error);

    const res = await app.request(`/admin/providers/${provider!.id}/test`, {
      method: "POST",
      headers: authHeader,
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.errorType).toBe("model_not_found");
    expect(body.message).toBe("端点/openai未配置模型gpt-4o");
  });

  it("returns 404 for missing provider", async () => {
    const res = await app.request("/admin/providers/9999/test", {
      method: "POST",
      headers: authHeader,
    });

    expect(res.status).toBe(404);
  });
});
