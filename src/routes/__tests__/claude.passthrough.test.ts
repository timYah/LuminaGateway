import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../services/requestLogService", () => ({
  createRequestLog: vi.fn(async () => null),
}));

vi.mock("../../services/failureStatsService", async () => {
  const actual = await vi.importActual<typeof import("../../services/failureStatsService")>(
    "../../services/failureStatsService"
  );
  return {
    ...actual,
    recordFailure: vi.fn(),
  };
});

vi.mock("../../services/providerService", async () => {
  const actual = await vi.importActual<typeof import("../../services/providerService")>(
    "../../services/providerService"
  );
  return {
    ...actual,
    deactivateProvider: vi.fn(async () => null),
  };
});

vi.mock("../../services/billingService", async () => {
  const actual = await vi.importActual<typeof import("../../services/billingService")>(
    "../../services/billingService"
  );
  return {
    ...actual,
    billUsage: vi.fn(),
  };
});

import { createApp } from "../../app";
import * as billingService from "../../services/billingService";
import * as failureStatsService from "../../services/failureStatsService";
import { gatewayCircuitBreaker, gatewayRouter } from "../../services/gatewayService";
import * as providerService from "../../services/providerService";
import { providerRecoveryService } from "../../services/providerRecoveryService";
import { groupQuotaTracker, keyQuotaTracker, userQuotaTracker } from "../../services/quotaService";
import * as requestLogService from "../../services/requestLogService";

process.env.GATEWAY_API_KEY = "test-key";

const app = createApp();
const authHeaders = {
  Authorization: "Bearer test-key",
  "Content-Type": "application/json",
};

const anthropicProvider = {
  id: 1,
  name: "Anthropic Primary",
  protocol: "anthropic" as const,
  baseUrl: "https://api.anthropic.com",
  apiKey: "anthropic-primary",
  apiMode: "responses" as const,
  codexTransform: false,
  balance: 0,
  inputPrice: null,
  outputPrice: null,
  isActive: true,
  priority: 1,
  healthStatus: "unknown" as const,
  lastHealthCheckAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const anthropicBackupProvider = {
  ...anthropicProvider,
  id: 2,
  name: "Anthropic Backup",
  baseUrl: "https://backup.example.com/v1",
  apiKey: "anthropic-backup",
  priority: 2,
};

const openaiProvider = {
  ...anthropicProvider,
  id: 3,
  name: "OpenAI",
  protocol: "openai" as const,
  baseUrl: "https://api.openai.com/v1",
  apiKey: "sk-openai",
};

const fetchMock = vi.fn<typeof fetch>();
const getAllCandidatesSpy = vi.spyOn(gatewayRouter, "getAllCandidates");
const openCircuitSpy = vi.spyOn(gatewayCircuitBreaker, "open");
const createRequestLogMock = vi.mocked(requestLogService.createRequestLog);
const recordFailureMock = vi.mocked(failureStatsService.recordFailure);
const deactivateProviderMock = vi.mocked(providerService.deactivateProvider);
const billUsageMock = vi.mocked(billingService.billUsage);

beforeAll(() => {
  vi.stubGlobal("fetch", fetchMock);
});

describe("claude passthrough routes", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    getAllCandidatesSpy.mockReset();
    openCircuitSpy.mockClear();
    createRequestLogMock.mockClear();
    recordFailureMock.mockClear();
    deactivateProviderMock.mockClear();
    billUsageMock.mockClear();
    getAllCandidatesSpy.mockResolvedValue([anthropicProvider]);
    gatewayCircuitBreaker.reset(anthropicProvider.id);
    gatewayCircuitBreaker.reset(anthropicBackupProvider.id);
    providerRecoveryService.resetAll();
    providerRecoveryService.stop();
  });

  afterEach(() => {
    delete process.env.CLAUDE_UPSTREAM_TIMEOUT_MS;
    delete process.env.TOKEN_RATE_LIMIT_TPM;
    delete process.env.TOKEN_RATE_LIMIT_BURST;
    delete process.env.TOKEN_RATE_LIMIT_OVERRIDES;
    delete process.env.KEY_DAILY_TOKENS;
    delete process.env.KEY_MONTHLY_TOKENS;
    delete process.env.KEY_DAILY_BUDGET_USD;
    delete process.env.KEY_MONTHLY_BUDGET_USD;
    delete process.env.KEY_QUOTA_OVERRIDES;
    delete process.env.CONTENT_BLOCKLIST;
    delete process.env.JWT_SECRET;
    delete process.env.JWT_HEADER;
    delete process.env.JWT_USER_CLAIM;
    delete process.env.JWT_GROUP_CLAIM;
    delete process.env.USER_DAILY_TOKENS;
    delete process.env.USER_MONTHLY_TOKENS;
    delete process.env.USER_DAILY_BUDGET_USD;
    delete process.env.USER_MONTHLY_BUDGET_USD;
    delete process.env.USER_QUOTA_OVERRIDES;
    delete process.env.GROUP_DAILY_TOKENS;
    delete process.env.GROUP_MONTHLY_TOKENS;
    delete process.env.GROUP_DAILY_BUDGET_USD;
    delete process.env.GROUP_MONTHLY_BUDGET_USD;
    delete process.env.GROUP_QUOTA_OVERRIDES;
    keyQuotaTracker.reset();
    userQuotaTracker.reset();
    groupQuotaTracker.reset();
  });

  it("rejects invalid JSON bodies", async () => {
    const res = await app.request("/claude/v1/messages", {
      method: "POST",
      headers: authHeaders,
      body: "not-json",
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: {
        message: "Invalid request",
        type: "gateway_error",
        code: "gateway_error",
      },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires a model slug", async () => {
    const res = await app.request("/claude/v1/messages", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ messages: [] }),
    });

    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blocks content matching the safety list", async () => {
    process.env.CONTENT_BLOCKLIST = "secret";
    const res = await app.request("/claude/v1/messages", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        messages: [{ role: "user", content: "secret" }],
      }),
    });

    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires JWT when enabled", async () => {
    process.env.JWT_SECRET = "test-secret";
    const res = await app.request("/claude/v1/messages", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ model: "claude-sonnet-4-20250514", messages: [] }),
    });

    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("proxies the raw request body and upstream response without billing", async () => {
    getAllCandidatesSpy.mockResolvedValue([openaiProvider, anthropicProvider]);

    const rawBody = JSON.stringify({
      model: "claude-sonnet-4-20250514",
      messages: [{ role: "user", content: "hello" }],
      stream: false,
      metadata: { source: "claude-sdk" },
    });
    const upstreamBody = JSON.stringify({ id: "msg_1", type: "message", role: "assistant" });
    fetchMock.mockResolvedValueOnce(
      new Response(upstreamBody, {
        status: 200,
        headers: {
          "content-type": "application/json",
          "x-upstream-request-id": "req-anthropic",
        },
      })
    );

    const res = await app.request("/claude/v1/messages?trace=1", {
      method: "POST",
      headers: authHeaders,
      body: rawBody,
    });

    expect(res.status).toBe(200);
    expect(await res.text()).toBe(upstreamBody);
    expect(res.headers.get("x-upstream-request-id")).toBe("req-anthropic");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/messages?trace=1",
      expect.objectContaining({ method: "POST", body: rawBody })
    );

    const init = fetchMock.mock.calls[0]?.[1];
    const headers = new Headers(init?.headers as Record<string, string>);
    expect(headers.get("x-api-key")).toBe("anthropic-primary");
    expect(headers.get("authorization")).toBeNull();
    expect(headers.get("content-type")).toBe("application/json");
    expect(createRequestLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: 1,
        modelSlug: "claude-sonnet-4-20250514",
        result: "success",
      })
    );
    expect(billUsageMock).not.toHaveBeenCalled();
  });

  it("preserves raw SSE responses", async () => {
    const sseBody =
      'event: message_start\ndata: {"type":"message_start"}\n\n' +
      'event: message_stop\ndata: {"type":"message_stop"}\n\n';
    fetchMock.mockResolvedValueOnce(
      new Response(sseBody, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      })
    );

    const res = await app.request("/claude/v1/messages", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ model: "claude-sonnet-4-20250514", messages: [], stream: true }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    expect(await res.text()).toBe(sseBody);
  });

  it("fails over before the first byte on retryable upstream errors", async () => {
    getAllCandidatesSpy.mockResolvedValue([anthropicProvider, anthropicBackupProvider]);
    fetchMock
      .mockResolvedValueOnce(
        new Response('{"error":{"message":"Rate limit"}}', {
          status: 429,
          headers: { "content-type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response('{"id":"msg_ok","type":"message"}', {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      );

    const res = await app.request("/claude/v1/messages", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ model: "claude-sonnet-4-20250514", messages: [] }),
    });

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(recordFailureMock).toHaveBeenCalledWith(1, "rate_limit");
    expect(openCircuitSpy).toHaveBeenCalledWith(
      1,
      60_000,
      "claude-sonnet-4-20250514"
    );
  });

  it("fails over when the upstream request times out", async () => {
    process.env.CLAUDE_UPSTREAM_TIMEOUT_MS = "5";
    getAllCandidatesSpy.mockResolvedValue([anthropicProvider, anthropicBackupProvider]);
    fetchMock
      .mockImplementationOnce((_url, init) => {
        const signal = init?.signal as AbortSignal | undefined;
        return new Promise<Response>((_resolve, reject) => {
          if (!signal) {
            reject(new Error("Missing abort signal"));
            return;
          }
          signal.addEventListener("abort", () => {
            const abortError = new Error("The operation was aborted");
            abortError.name = "AbortError";
            reject(abortError);
          });
        });
      })
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "msg_ok" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      );

    const res = await app.request("/claude/v1/messages", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ model: "claude-sonnet-4-20250514", messages: [] }),
    });

    expect(res.status).toBe(200);
    expect(openCircuitSpy).toHaveBeenCalledWith(
      1,
      60_000,
      "claude-sonnet-4-20250514"
    );
  });
});
