import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { APICallError } from "ai";
import { createApp } from "../../app";
import { getDb, type SqliteDatabase } from "../../db";
import { providers } from "../../db/schema";
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

  it("returns model_not_found for new-api providers when upstream reports missing model", async () => {
    const provider = await createProvider({
      name: "Missing Model Provider",
      protocol: "new-api",
      baseUrl: "https://api.example.com",
      apiKey: "sk-missing",
      balance: 10,
      isActive: true,
      priority: 1,
    });

    mockedCall.mockRejectedValue(
      new APICallError({
        message: "Model not found",
        url: "https://api.example.com",
        requestBodyValues: {},
        statusCode: 404,
      })
    );

    const res = await app.request(`/admin/providers/${provider!.id}/test`, {
      method: "POST",
      headers: authHeader,
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.errorType).toBe("model_not_found");
  });

  it("returns 404 for missing provider", async () => {
    const res = await app.request("/admin/providers/9999/test", {
      method: "POST",
      headers: authHeader,
    });

    expect(res.status).toBe(404);
  });
});
