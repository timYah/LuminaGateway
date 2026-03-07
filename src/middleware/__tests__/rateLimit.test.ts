import { afterEach, describe, expect, it } from "vitest";
import { Hono } from "hono";
import { rateLimitMiddleware } from "../rateLimit";

function createApp() {
  const app = new Hono();
  app.use(rateLimitMiddleware());
  app.get("/ping", (c) => c.json({ ok: true }));
  return app;
}

const authHeader = { Authorization: "Bearer test-key" };

describe("rateLimitMiddleware", () => {
  afterEach(() => {
    delete process.env.RATE_LIMIT_RPM;
    delete process.env.RATE_LIMIT_BURST;
    delete process.env.RATE_LIMIT_OVERRIDES;
  });

  it("allows requests when rate limiting is disabled", async () => {
    const app = createApp();
    const res = await app.request("/ping", { headers: authHeader });
    expect(res.status).toBe(200);
  });

  it("limits repeated requests with default settings", async () => {
    process.env.RATE_LIMIT_RPM = "60";
    process.env.RATE_LIMIT_BURST = "1";
    const app = createApp();
    const first = await app.request("/ping", { headers: authHeader });
    const second = await app.request("/ping", { headers: authHeader });
    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
  });

  it("honors per-token overrides", async () => {
    process.env.RATE_LIMIT_RPM = "60";
    process.env.RATE_LIMIT_BURST = "1";
    process.env.RATE_LIMIT_OVERRIDES = JSON.stringify({
      "override-key": { rpm: 120, burst: 2 },
    });
    const app = createApp();
    const headers = { Authorization: "Bearer override-key" };
    const first = await app.request("/ping", { headers });
    const second = await app.request("/ping", { headers });
    const third = await app.request("/ping", { headers });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(third.status).toBe(429);
  });
});
