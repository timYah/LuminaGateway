import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { resetMetrics } from "../services/metricsService";

describe("metrics endpoint", () => {
  afterEach(() => {
    resetMetrics();
  });

  it("exposes prometheus metrics", async () => {
    const app = createApp();
    await app.request("/health");
    const res = await app.request("/metrics");
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(text).toContain("gateway_requests_total");
    expect(text).toContain('path="/health"');
  });
});
