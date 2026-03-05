import { describe, expect, it } from "vitest";
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
});
