import { describe, expect, it, vi } from "vitest";
vi.mock("../../services/gatewayService", () => ({
  handleRequest: vi.fn().mockImplementation(
    (_params: unknown, clientFormat: "openai" | "anthropic") => {
      if (clientFormat === "openai") {
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
      return Promise.resolve({
        status: 503,
        body: {
          type: "error",
          error: { type: "gateway_error", message: "No provider available" },
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
