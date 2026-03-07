import { afterEach, describe, expect, it } from "vitest";
import { Hono } from "hono";
import { authMiddleware } from "../auth";

process.env.GATEWAY_API_KEY = "test-key";

function createApp() {
  const app = new Hono();
  app.use(authMiddleware());
  app.get("/protected", (c) => c.json({ ok: true }));
  return app;
}

describe("authMiddleware", () => {
  afterEach(() => {
    delete process.env.GATEWAY_API_KEYS;
  });

  it("returns 401 when Authorization is missing", async () => {
    const app = createApp();
    const res = await app.request("/protected");
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: { message: "Unauthorized" } });
  });

  it("returns 401 when token is invalid", async () => {
    const app = createApp();
    const res = await app.request("/protected", {
      headers: { Authorization: "Bearer wrong" },
    });
    expect(res.status).toBe(401);
  });

  it("allows requests with valid token", async () => {
    const app = createApp();
    const res = await app.request("/protected", {
      headers: { Authorization: "Bearer test-key" },
    });
    expect(res.status).toBe(200);
  });

  it("allows requests with tokens from GATEWAY_API_KEYS", async () => {
    process.env.GATEWAY_API_KEYS = "alpha,beta";
    const app = createApp();
    const res = await app.request("/protected", {
      headers: { Authorization: "Bearer beta" },
    });
    expect(res.status).toBe(200);
  });

  it("rejects tokens not in GATEWAY_API_KEYS", async () => {
    process.env.GATEWAY_API_KEYS = "alpha,beta";
    const app = createApp();
    const res = await app.request("/protected", {
      headers: { Authorization: "Bearer gamma" },
    });
    expect(res.status).toBe(401);
  });
});
