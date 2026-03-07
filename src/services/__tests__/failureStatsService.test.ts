import { beforeEach, describe, expect, it } from "vitest";
import {
  getFailureStats,
  recordFailure,
  resetFailureStats,
} from "../failureStatsService";

describe("failureStatsService", () => {
  beforeEach(() => {
    resetFailureStats();
  });

  it("aggregates failure counts by provider and total", () => {
    recordFailure(1, "quota");
    recordFailure(1, "network");
    recordFailure(2, "quota");

    const stats = getFailureStats();

    expect(stats.total.quota).toBe(2);
    expect(stats.total.network).toBe(1);
    expect(stats.providers["1"].quota).toBe(1);
    expect(stats.providers["1"].network).toBe(1);
    expect(stats.providers["2"].quota).toBe(1);
  });
});
