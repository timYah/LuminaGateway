import { afterEach, describe, expect, it } from "vitest";
import { InflightLimiter } from "../inflightService";

describe("InflightLimiter", () => {
  afterEach(() => {
    delete process.env.PROVIDER_MAX_INFLIGHT;
    delete process.env.PROVIDER_MAX_INFLIGHT_OVERRIDES;
  });

  it("enforces default limits", () => {
    process.env.PROVIDER_MAX_INFLIGHT = "1";
    const limiter = new InflightLimiter();
    expect(limiter.tryAcquire(1, "Provider A")).toBe(true);
    expect(limiter.tryAcquire(1, "Provider A")).toBe(false);
    limiter.release(1);
    expect(limiter.tryAcquire(1, "Provider A")).toBe(true);
  });

  it("honors per-provider overrides", () => {
    process.env.PROVIDER_MAX_INFLIGHT = "1";
    process.env.PROVIDER_MAX_INFLIGHT_OVERRIDES = JSON.stringify({
      "2": 2,
      "Provider C": 3,
    });
    const limiter = new InflightLimiter();
    expect(limiter.tryAcquire(2, "Provider B")).toBe(true);
    expect(limiter.tryAcquire(2, "Provider B")).toBe(true);
    expect(limiter.tryAcquire(2, "Provider B")).toBe(false);

    expect(limiter.tryAcquire(3, "Provider C")).toBe(true);
    expect(limiter.tryAcquire(3, "Provider C")).toBe(true);
    expect(limiter.tryAcquire(3, "Provider C")).toBe(true);
    expect(limiter.tryAcquire(3, "Provider C")).toBe(false);
  });
});
