import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../../services/gatewayService", () => ({
  handleRequest: vi.fn().mockImplementation(
    (_params: unknown, clientFormat: "openai" | "openai-responses" | "anthropic") => {
      if (clientFormat === "anthropic") {
        return Promise.resolve({
          status: 503,
          body: {
            type: "error",
            error: { type: "gateway_error", message: "No provider available" },
          },
        });
      }
      return Promise.resolve({
        status: 503,
        body: {
          error: {
            message: "No provider available",
            type: "gateway_error",
            code: "gateway_error",
          },
        },
      });
    }
  ),
}));
import { createApp } from "../../app";
import { groupQuotaTracker, keyQuotaTracker, userQuotaTracker } from "../../services/quotaService";
import { resetUsageSummary } from "../../services/usageSummaryService";

process.env.GATEWAY_API_KEY = "test-key";

const app = createApp();

const authHeader = { Authorization: "Bearer test-key" };

function createJwt(payload: Record<string, unknown>, secret: string) {
  const header = { alg: "HS256", typ: "JWT" };
  const encode = (value: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = `${encode(header)}.${encode(payload)}`;
  const signature = createHmac("sha256", secret).update(token).digest("base64url");
  return `${token}.${signature}`;
}

describe("route stubs", () => {
  afterEach(() => {
    delete process.env.MODEL_ALLOWLIST;
    delete process.env.MODEL_BLOCKLIST;
    delete process.env.TOKEN_RATE_LIMIT_TPM;
    delete process.env.TOKEN_RATE_LIMIT_BURST;
    delete process.env.TOKEN_RATE_LIMIT_OVERRIDES;
    delete process.env.KEY_DAILY_TOKENS;
    delete process.env.KEY_MONTHLY_TOKENS;
    delete process.env.KEY_DAILY_BUDGET_USD;
    delete process.env.KEY_MONTHLY_BUDGET_USD;
    delete process.env.KEY_QUOTA_OVERRIDES;
    delete process.env.CONTENT_BLOCKLIST;
    delete process.env.JWT_SECRET;
    delete process.env.JWT_HEADER;
    delete process.env.JWT_USER_CLAIM;
    delete process.env.JWT_GROUP_CLAIM;
    delete process.env.USER_DAILY_TOKENS;
    delete process.env.USER_MONTHLY_TOKENS;
    delete process.env.USER_DAILY_BUDGET_USD;
    delete process.env.USER_MONTHLY_BUDGET_USD;
    delete process.env.USER_QUOTA_OVERRIDES;
    delete process.env.GROUP_DAILY_TOKENS;
    delete process.env.GROUP_MONTHLY_TOKENS;
    delete process.env.GROUP_DAILY_BUDGET_USD;
    delete process.env.GROUP_MONTHLY_BUDGET_USD;
    delete process.env.GROUP_QUOTA_OVERRIDES;
    keyQuotaTracker.reset();
    userQuotaTracker.reset();
    groupQuotaTracker.reset();
    resetUsageSummary();
  });

  it("rejects unauthenticated OpenAI request", async () => {
    const res = await app.request("/v1/chat/completions", {
      method: "POST",
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(401);
  });

  it("validates OpenAI request body", async () => {
    const res = await app.request("/v1/chat/completions", {
      method: "POST",
      headers: authHeader,
      body: JSON.stringify({ model: "gpt-4o" }),
    });
    expect(res.status).toBe(400);
  });

  it("validates OpenAI Responses request body", async () => {
    const res = await app.request("/v1/responses", {
      method: "POST",
      headers: authHeader,
      body: JSON.stringify({ model: "gpt-5.2" }),
    });
    expect(res.status).toBe(400);
  });

  it("blocks models outside the allowlist", async () => {
    process.env.MODEL_ALLOWLIST = "gpt-4o";
    const res = await app.request("/v1/chat/completions", {
      method: "POST",
      headers: authHeader,
      body: JSON.stringify({
        model: "gpt-5.2",
        messages: [{ role: "user", content: "hi" }],
      }),
    });
    expect(res.status).toBe(403);
  });

  it("blocks models in the blocklist", async () => {
    process.env.MODEL_BLOCKLIST = "gpt-4o";
    const res = await app.request("/v1/chat/completions", {
      method: "POST",
      headers: authHeader,
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [{ role: "user", content: "hi" }],
      }),
    });
    expect(res.status).toBe(403);
  });

  it("blocks content matching the safety list", async () => {
    process.env.CONTENT_BLOCKLIST = "secret";
    const res = await app.request("/v1/chat/completions", {
      method: "POST",
      headers: authHeader,
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [{ role: "user", content: "this contains a secret" }],
      }),
    });
    expect(res.status).toBe(403);
  });

  it("returns OpenAI error when no providers are available", async () => {
    const res = await app.request("/v1/chat/completions", {
      method: "POST",
      headers: authHeader,
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [{ role: "user", content: "hi" }],
      }),
    });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error?.message).toBeDefined();
  });

  it("rate limits based on token budget", async () => {
    process.env.TOKEN_RATE_LIMIT_TPM = "1";
    process.env.TOKEN_RATE_LIMIT_BURST = "1";
    const res1 = await app.request("/v1/chat/completions", {
      method: "POST",
      headers: authHeader,
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [{ role: "user", content: "" }],
        max_tokens: 1,
      }),
    });
    const res2 = await app.request("/v1/chat/completions", {
      method: "POST",
      headers: authHeader,
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [{ role: "user", content: "" }],
        max_tokens: 1,
      }),
    });

    expect(res1.status).toBe(503);
    expect(res2.status).toBe(429);
  });

  it("enforces key quotas", async () => {
    process.env.KEY_DAILY_TOKENS = "1";

    const first = await app.request("/v1/chat/completions", {
      method: "POST",
      headers: authHeader,
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [{ role: "user", content: "" }],
        max_tokens: 1,
      }),
    });

    const second = await app.request("/v1/chat/completions", {
      method: "POST",
      headers: authHeader,
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [{ role: "user", content: "" }],
        max_tokens: 1,
      }),
    });

    expect(first.status).toBe(503);
    expect(second.status).toBe(429);
  });

  it("requires JWT when enabled", async () => {
    process.env.JWT_SECRET = "test-secret";
    const res = await app.request("/v1/chat/completions", {
      method: "POST",
      headers: authHeader,
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [{ role: "user", content: "hi" }],
      }),
    });
    expect(res.status).toBe(401);
  });

  it("enforces user quotas from JWT", async () => {
    process.env.JWT_SECRET = "test-secret";
    process.env.USER_DAILY_TOKENS = "1";
    const token = createJwt({ sub: "user-1" }, "test-secret");

    const first = await app.request("/v1/chat/completions", {
      method: "POST",
      headers: { ...authHeader, "X-User-Token": token },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [{ role: "user", content: "" }],
        max_tokens: 1,
      }),
    });

    const second = await app.request("/v1/chat/completions", {
      method: "POST",
      headers: { ...authHeader, "X-User-Token": token },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [{ role: "user", content: "" }],
        max_tokens: 1,
      }),
    });

    expect(first.status).toBe(503);
    expect(second.status).toBe(429);
  });

  it("records usage summary by key and route", async () => {
    resetUsageSummary();
    await app.request("/v1/chat/completions", {
      method: "POST",
      headers: authHeader,
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [{ role: "user", content: "hi" }],
      }),
    });

    const summaryRes = await app.request("/admin/usage/summary", {
      headers: authHeader,
    });
    expect(summaryRes.status).toBe(200);
    const body = await summaryRes.json();
    expect(body.totals.requests).toBeGreaterThanOrEqual(1);
    expect(body.byKey["test-key"]).toBeDefined();
    expect(body.byRoute["/v1/chat/completions"]).toBeDefined();
    expect(body.byKeyRoute["test-key"]["/v1/chat/completions"]).toBeDefined();
  });

  it("returns Responses API error when no providers are available", async () => {
    const res = await app.request("/v1/responses", {
      method: "POST",
      headers: authHeader,
      body: JSON.stringify({
        model: "gpt-5.2",
        input: "hi",
      }),
    });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error?.message).toBeDefined();
  });

  it("returns Anthropic error when no providers are available", async () => {
    const res = await app.request("/v1/messages", {
      method: "POST",
      headers: authHeader,
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        messages: [{ role: "user", content: "hi" }],
      }),
    });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.type).toBe("error");
  });
});
