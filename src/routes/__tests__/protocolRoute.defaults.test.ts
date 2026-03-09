import { afterEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { z } from "zod";

vi.mock("../../services/gatewayService", () => ({
  handleRequest: vi.fn().mockResolvedValue({ status: 200, body: { ok: true } }),
  handleStreamingRequest: vi
    .fn()
    .mockResolvedValue({ status: 200, body: { ok: true } }),
}));

import { handleRequest, handleStreamingRequest } from "../../services/gatewayService";
import { createProtocolRoute } from "../protocolRoute";

const schema = z.object({
  model: z.string(),
  temperature: z.number().optional(),
  stream: z.boolean().optional(),
});

function createApp() {
  const app = new Hono();
  app.route(
    "/",
    createProtocolRoute({
      path: "/v1/test",
      schema,
      converter: (data) => ({
        model: data.model,
        temperature: data.temperature,
      }),
      clientFormat: "openai",
    })
  );
  return app;
}

describe("protocol route default params", () => {
  afterEach(() => {
    delete process.env.DEFAULT_REQUEST_PARAMS;
    vi.mocked(handleRequest).mockClear();
    vi.mocked(handleStreamingRequest).mockClear();
  });

  it("injects default params when missing", async () => {
    process.env.DEFAULT_REQUEST_PARAMS = JSON.stringify({ temperature: 0.3 });
    const app = createApp();
    await app.request("/v1/test", {
      method: "POST",
      body: JSON.stringify({ model: "gpt-4o" }),
    });

    expect(handleRequest).toHaveBeenCalledWith(
      { model: "gpt-4o", temperature: 0.3 },
      "openai",
      expect.objectContaining({ requestId: expect.any(String) })
    );
  });

  it("does not override explicit request params", async () => {
    process.env.DEFAULT_REQUEST_PARAMS = JSON.stringify({ temperature: 0.3 });
    const app = createApp();
    await app.request("/v1/test", {
      method: "POST",
      body: JSON.stringify({ model: "gpt-4o", temperature: 0.9 }),
    });

    expect(handleRequest).toHaveBeenCalledWith(
      { model: "gpt-4o", temperature: 0.9 },
      "openai",
      expect.objectContaining({ requestId: expect.any(String) })
    );
  });

  it("applies defaults to streaming requests too", async () => {
    process.env.DEFAULT_REQUEST_PARAMS = JSON.stringify({ temperature: 0.4 });
    const app = createApp();
    await app.request("/v1/test", {
      method: "POST",
      body: JSON.stringify({ model: "gpt-4o", stream: true }),
    });

    expect(handleStreamingRequest).toHaveBeenCalledWith(
      { model: "gpt-4o", temperature: 0.4 },
      "openai",
      expect.objectContaining({ requestId: expect.any(String) })
    );
  });
});
