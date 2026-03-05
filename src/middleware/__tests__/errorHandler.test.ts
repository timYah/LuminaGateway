import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { errorHandler } from "../errorHandler";

describe("errorHandler", () => {
  it("formats OpenAI errors", async () => {
    const app = new Hono();
    app.get("/v1/chat/completions", () => {
      throw new Error("Boom");
    });
    app.onError(errorHandler);

    const res = await app.request("/v1/chat/completions");
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatchObject({
      message: "Boom",
      type: "server_error",
      code: "server_error",
    });
  });

  it("formats Anthropic errors", async () => {
    const app = new Hono();
    app.get("/v1/messages", () => {
      throw new Error("Boom");
    });
    app.onError(errorHandler);

    const res = await app.request("/v1/messages");
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toMatchObject({
      type: "error",
      error: { type: "server_error", message: "Boom" },
    });
  });
});
