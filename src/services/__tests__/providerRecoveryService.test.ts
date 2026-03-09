import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderRecoveryService } from "../providerRecoveryService";

describe("providerRecoveryService", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-08T00:00:00.000Z"));
    process.env.PROVIDER_RECOVERY_CHECK_INTERVAL_MS = "1000";
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete process.env.PROVIDER_RECOVERY_CHECK_INTERVAL_MS;
  });

  it("adds jitter and probes only after the scheduled time", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const probe = vi.fn().mockResolvedValue({ ok: true as const });
    const service = new ProviderRecoveryService();
    service.start(probe);

    const entry = service.markRecovering({
      providerId: 1,
      errorType: "server",
      probeModel: "gpt-4o",
    });

    expect(entry.nextProbeAt.toISOString()).toBe("2026-03-08T00:00:02.000Z");

    await vi.advanceTimersByTimeAsync(1999);
    expect(probe).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(probe).toHaveBeenCalledTimes(1);
    expect(service.isRecovering(1)).toBe(false);
  });

  it("reschedules after a failed probe and stores the last probe result", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
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

    await vi.advanceTimersByTimeAsync(2000);

    const entry = service.getEntry(9);
    expect(entry).not.toBeNull();
    expect(entry?.lastProbeErrorType).toBe("network");
    expect(entry?.lastProbeMessage).toBe("down");
    expect(entry?.lastProbeAt?.toISOString()).toBe("2026-03-08T00:00:02.000Z");
    expect(entry?.nextProbeAt.toISOString()).toBe("2026-03-08T00:00:04.000Z");

    await vi.advanceTimersByTimeAsync(2000);
    expect(probe).toHaveBeenCalledTimes(2);
    expect(service.isRecovering(9)).toBe(false);
  });
});

