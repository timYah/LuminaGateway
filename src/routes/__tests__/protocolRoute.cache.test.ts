import { afterEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { z } from "zod";

vi.mock("../../services/gatewayService", () => ({
  handleRequest: vi.fn(),
  handleStreamingRequest: vi.fn(),
}));

import { handleRequest } from "../../services/gatewayService";
import { responseCache } from "../../services/cacheService";
import type { OpenAIChatCompletionResponse } from "../../types/openai";
import { createProtocolRoute } from "../protocolRoute";

const schema = z.object({
  model: z.string(),
});

const okBody: OpenAIChatCompletionResponse = {
  id: "chatcmpl_test",
  object: "chat.completion",
  created: 0,
  model: "gpt-4o",
  choices: [
    {
      index: 0,
      message: { role: "assistant", content: "ok" },
      finish_reason: "stop",
    },
  ],
};

function createApp() {
  const app = new Hono();
  app.route(
    "/",
    createProtocolRoute({
      path: "/v1/test",
      schema,
      converter: (data) => ({ model: data.model }),
      clientFormat: "openai",
    })
  );
  return app;
}

describe("protocol route caching", () => {
  afterEach(() => {
    delete process.env.CACHE_TTL_MS;
    responseCache.clear();
    vi.mocked(handleRequest).mockReset();
  });

  it("caches successful responses when enabled", async () => {
    process.env.CACHE_TTL_MS = "1000";
    vi.mocked(handleRequest).mockResolvedValue({
      status: 200,
      body: okBody,
    });
    const app = createApp();

    const first = await app.request("/v1/test", {
      method: "POST",
      body: JSON.stringify({ model: "gpt-4o" }),
    });
    const second = await app.request("/v1/test", {
      method: "POST",
      body: JSON.stringify({ model: "gpt-4o" }),
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(vi.mocked(handleRequest)).toHaveBeenCalledTimes(1);
  });

  it("respects per-request cache ttl overrides", async () => {
    process.env.CACHE_TTL_MS = "1000";
    vi.mocked(handleRequest).mockResolvedValue({
      status: 200,
      body: okBody,
    });
    const app = createApp();

    await app.request("/v1/test", {
      method: "POST",
      headers: { "x-cache-ttl-ms": "0" },
      body: JSON.stringify({ model: "gpt-4o" }),
    });
    await app.request("/v1/test", {
      method: "POST",
      headers: { "x-cache-ttl-ms": "0" },
      body: JSON.stringify({ model: "gpt-4o" }),
    });

    expect(vi.mocked(handleRequest)).toHaveBeenCalledTimes(2);
  });

  it("does not cache non-success responses", async () => {
    process.env.CACHE_TTL_MS = "1000";
    vi.mocked(handleRequest).mockResolvedValue({
      status: 500,
      body: {
        error: { message: "fail", type: "gateway_error", code: "gateway_error" },
      },
    });
    const app = createApp();

    await app.request("/v1/test", {
      method: "POST",
      body: JSON.stringify({ model: "gpt-4o" }),
    });
    await app.request("/v1/test", {
      method: "POST",
      body: JSON.stringify({ model: "gpt-4o" }),
    });

    expect(vi.mocked(handleRequest)).toHaveBeenCalledTimes(2);
  });
});
