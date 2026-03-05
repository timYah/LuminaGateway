import { describe, expect, it } from "vitest";
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

  it("returns stub OpenAI response", async () => {
    const res = await app.request("/v1/chat/completions", {
      method: "POST",
      headers: authHeader,
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [{ role: "user", content: "hi" }],
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.object).toBe("chat.completion");
  });

  it("returns stub Anthropic response", async () => {
    const res = await app.request("/v1/messages", {
      method: "POST",
      headers: authHeader,
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        messages: [{ role: "user", content: "hi" }],
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.type).toBe("message");
  });
});
