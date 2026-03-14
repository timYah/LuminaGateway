import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActiveRequestService } from "../activeRequestService";

describe("activeRequestService", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-09T10:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("tracks active requests and provider failover attempts", () => {
    const service = new ActiveRequestService();

    service.startRequest({
      requestId: "req-1",
      path: "/v1/chat/completions",
      modelSlug: "gpt-4o",
    });
    service.startAttempt({
      requestId: "req-1",
      providerId: 1,
      providerName: "Provider A",
    });

    vi.advanceTimersByTime(120);
    service.failAttempt({
      requestId: "req-1",
      providerId: 1,
      errorType: "rate_limit",
    });

    vi.advanceTimersByTime(30);
    service.startAttempt({
      requestId: "req-1",
      providerId: 2,
      providerName: "Provider B",
    });

    vi.advanceTimersByTime(250);
    const [entry] = service.getEntries();

    expect(entry).toMatchObject({
      requestId: "req-1",
      path: "/v1/chat/completions",
      modelSlug: "gpt-4o",
      currentProviderId: 2,
      currentProviderName: "Provider B",
    });
    expect(entry.elapsedMs).toBe(400);
    expect(entry.attempts).toEqual([
      expect.objectContaining({
        providerId: 1,
        providerName: "Provider A",
        status: "failed",
        errorType: "rate_limit",
        elapsedMs: 120,
      }),
      expect.objectContaining({
        providerId: 2,
        providerName: "Provider B",
        status: "active",
        errorType: null,
        elapsedMs: 250,
      }),
    ]);
  });

  it("removes finished requests", () => {
    const service = new ActiveRequestService();

    service.startRequest({
      requestId: "req-2",
      path: "/openai/v1/responses",
      modelSlug: "gpt-5.2",
    });

    expect(service.getEntries()).toHaveLength(1);

    service.finishRequest("req-2");

    expect(service.getEntries()).toHaveLength(0);
  });
});
