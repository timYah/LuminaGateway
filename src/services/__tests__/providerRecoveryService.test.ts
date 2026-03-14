import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderRecoveryService } from "../providerRecoveryService";

describe("providerRecoveryService", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-08T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete process.env.PROVIDER_RECOVERY_CHECK_INTERVAL_MS;
  });

  it("uses the fixed interval override when configured", async () => {
    process.env.PROVIDER_RECOVERY_CHECK_INTERVAL_MS = "1000";
    const probe = vi.fn().mockResolvedValue({ ok: true as const });
    const service = new ProviderRecoveryService();
    service.start(probe);

    const entry = service.markRecovering({
      providerId: 1,
      errorType: "server",
      probeModel: "gpt-4o",
    });

    expect(entry.nextProbeAt.toISOString()).toBe("2026-03-08T00:00:01.000Z");

    await vi.advanceTimersByTimeAsync(999);
    expect(probe).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(probe).toHaveBeenCalledTimes(1);
    expect(service.isRecovering(1)).toBe(false);
  });

  it("backs off after failed probes", async () => {
    const probe = vi
      .fn()
      .mockResolvedValueOnce({ ok: false as const, errorType: "network", message: "down" })
      .mockResolvedValueOnce({ ok: true as const });
    const service = new ProviderRecoveryService();
    service.start(probe);
    service.markRecovering({
      providerId: 9,
      errorType: "rate_limit",
      probeModel: "gpt-5.2",
    });

    const entry = service.getEntry(9);
    expect(entry?.nextProbeAt.toISOString()).toBe("2026-03-08T00:00:10.000Z");

    await vi.advanceTimersByTimeAsync(10_000);

    const updated = service.getEntry(9);
    expect(updated).not.toBeNull();
    expect(updated?.lastProbeErrorType).toBe("network");
    expect(updated?.lastProbeMessage).toBe("down");
    expect(updated?.lastProbeAt?.toISOString()).toBe("2026-03-08T00:00:10.000Z");
    expect(updated?.nextProbeAt.toISOString()).toBe("2026-03-08T00:00:30.000Z");

    await vi.advanceTimersByTimeAsync(20_000);
    expect(probe).toHaveBeenCalledTimes(2);
    expect(service.isRecovering(9)).toBe(false);
  });
});
