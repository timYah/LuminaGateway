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

process.env.GATEWAY_API_KEY = "test-key";

const app = createApp();

const authHeader = { Authorization: "Bearer test-key" };

describe("route stubs", () => {
  afterEach(() => {
    delete process.env.MODEL_ALLOWLIST;
    delete process.env.MODEL_BLOCKLIST;
    delete process.env.TOKEN_RATE_LIMIT_TPM;
    delete process.env.TOKEN_RATE_LIMIT_BURST;
    delete process.env.TOKEN_RATE_LIMIT_OVERRIDES;
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
