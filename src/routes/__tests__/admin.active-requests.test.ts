import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../app";
import { activeRequestService } from "../../services/activeRequestService";

process.env.GATEWAY_API_KEY = "test-key";

const app = createApp();
const authHeader = { Authorization: "Bearer test-key" };

describe("admin active requests", () => {
  beforeEach(() => {
    activeRequestService.resetAll();
  });

  it("returns current requests with provider attempts", async () => {
    const startedAt = new Date("2026-03-09T10:00:00.000Z");
    const failedAt = new Date("2026-03-09T10:00:00.150Z");
    const retryAt = new Date("2026-03-09T10:00:00.180Z");

    activeRequestService.startRequest({
      requestId: "req-active-1",
      path: "/v1/chat/completions",
      modelSlug: "gpt-4o",
      startedAt,
    });
    activeRequestService.startAttempt({
      requestId: "req-active-1",
      providerId: 1,
      providerName: "Provider A",
      startedAt,
    });
    activeRequestService.failAttempt({
      requestId: "req-active-1",
      providerId: 1,
      finishedAt: failedAt,
      errorType: "rate_limit",
    });
    activeRequestService.startAttempt({
      requestId: "req-active-1",
      providerId: 2,
      providerName: "Provider B",
      startedAt: retryAt,
    });

    const res = await app.request("/admin/active-requests", {
      headers: authHeader,
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.activeRequests).toHaveLength(1);
    expect(body.activeRequests[0]).toMatchObject({
      requestId: "req-active-1",
      path: "/v1/chat/completions",
      modelSlug: "gpt-4o",
      currentProviderId: 2,
      currentProviderName: "Provider B",
    });
    expect(body.activeRequests[0].startedAt).toBe(startedAt.toISOString());
    expect(body.activeRequests[0].attempts).toEqual([
      expect.objectContaining({
        providerId: 1,
        providerName: "Provider A",
        status: "failed",
        errorType: "rate_limit",
        startedAt: startedAt.toISOString(),
        finishedAt: failedAt.toISOString(),
      }),
      expect.objectContaining({
        providerId: 2,
        providerName: "Provider B",
        status: "active",
        errorType: null,
        startedAt: retryAt.toISOString(),
      }),
    ]);
  });
});
