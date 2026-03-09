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

const providerA = {
  id: 1,
  name: "Right Codes",
  protocol: "openai" as const,
  baseUrl: "https://right.codes/codex",
  apiKey: "sk-primary",
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

const providerB = {
  ...providerA,
  id: 2,
  name: "Backup",
  baseUrl: "https://backup.example.com/v1",
  apiKey: "sk-backup",
  priority: 2,
};

const transformedProvider = {
  ...providerA,
  id: 3,
  name: "Transform",
  codexTransform: true,
};

const anthropicProvider = {
  ...providerA,
  id: 4,
  name: "Anthropic",
  protocol: "anthropic" as const,
  baseUrl: "https://api.anthropic.com",
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

describe("codex passthrough route", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    getAllCandidatesSpy.mockReset();
    openCircuitSpy.mockClear();
    createRequestLogMock.mockClear();
    recordFailureMock.mockClear();
    deactivateProviderMock.mockClear();
    billUsageMock.mockClear();
    getAllCandidatesSpy.mockResolvedValue([providerA]);
    gatewayCircuitBreaker.reset(providerA.id);
    gatewayCircuitBreaker.reset(providerB.id);
    providerRecoveryService.resetAll();
    providerRecoveryService.stop();
  });

  afterEach(() => {
    delete process.env.CODEX_UPSTREAM_TIMEOUT_MS;
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
    const res = await app.request("/codex/responses", {
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
    const res = await app.request("/codex/responses", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ input: [] }),
    });

    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blocks content matching the safety list", async () => {
    process.env.CONTENT_BLOCKLIST = "secret";
    const res = await app.request("/codex/responses", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        model: "gpt-5.2",
        input: [{ role: "user", content: [{ type: "input_text", text: "secret" }] }],
      }),
    });

    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires JWT when enabled", async () => {
    process.env.JWT_SECRET = "test-secret";
    const res = await app.request("/codex/responses", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ model: "gpt-5.2", input: [] }),
    });

    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("proxies the raw request body and upstream response without billing", async () => {
    const rawBody = JSON.stringify({
      model: "gpt-5.2",
      input: [{ role: "user", content: [{ type: "input_text", text: "hello" }] }],
      stream: false,
      metadata: { source: "codex-cli" },
    });
    const upstreamBody = JSON.stringify({ id: "resp_1", status: "completed" });
    fetchMock.mockResolvedValueOnce(
      new Response(upstreamBody, {
        status: 200,
        headers: {
          "content-type": "application/json",
          "x-upstream-request-id": "req-provider-a",
        },
      })
    );

    const res = await app.request("/codex/responses?trace=1", {
      method: "POST",
      headers: authHeaders,
      body: rawBody,
    });

    expect(res.status).toBe(200);
    expect(await res.text()).toBe(upstreamBody);
    expect(res.headers.get("x-upstream-request-id")).toBe("req-provider-a");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://right.codes/codex/v1/responses?trace=1",
      expect.objectContaining({ method: "POST", body: rawBody })
    );

    const init = fetchMock.mock.calls[0]?.[1];
    const headers = new Headers(init?.headers as Record<string, string>);
    expect(headers.get("authorization")).toBe("Bearer sk-primary");
    expect(headers.get("content-type")).toBe("application/json");
    expect(createRequestLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ providerId: 1, modelSlug: "gpt-5.2", result: "success" })
    );
    expect(billUsageMock).not.toHaveBeenCalled();
  });

  it("preserves raw SSE responses", async () => {
    const sseBody =
      'data: {"type":"response.output_text.delta","delta":"Hi"}\n\n' +
      'data: {"type":"response.completed"}\n\n';
    fetchMock.mockResolvedValueOnce(
      new Response(sseBody, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      })
    );

    const res = await app.request("/codex/responses", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        model: "gpt-5.2",
        stream: true,
        input: [{ role: "user", content: [{ type: "input_text", text: "hi" }] }],
      }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(await res.text()).toBe(sseBody);
  });

  it("skips transformed and unsupported providers for passthrough", async () => {
    getAllCandidatesSpy.mockResolvedValue([
      anthropicProvider,
      transformedProvider,
      providerB,
    ]);
    fetchMock.mockResolvedValueOnce(
      new Response('{"id":"resp_2","status":"completed"}', {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    const res = await app.request("/codex/responses", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ model: "gpt-5.2", input: [] }),
    });

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://backup.example.com/v1/responses"
    );
  });

  it("fails over before the first byte on retryable upstream errors", async () => {
    getAllCandidatesSpy.mockResolvedValue([providerA, providerB]);
    fetchMock
      .mockResolvedValueOnce(
        new Response('{"error":{"message":"Rate limit"}}', {
          status: 429,
          headers: { "content-type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response('{"id":"resp_2","status":"completed"}', {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      );

    const res = await app.request("/codex/responses", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ model: "gpt-5.2", input: [] }),
    });

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(recordFailureMock).toHaveBeenCalledWith(1, "rate_limit");
    expect(openCircuitSpy).toHaveBeenCalledWith(1, 60_000);
  });

  it("fails over when the upstream request times out", async () => {
    process.env.CODEX_UPSTREAM_TIMEOUT_MS = "5";
    getAllCandidatesSpy.mockResolvedValue([providerA, providerB]);
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
        new Response(JSON.stringify({ id: "resp_ok" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      );

    const res = await app.request("/codex/responses", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ model: "gpt-5.2", input: [] }),
    });

    expect(res.status).toBe(200);
    expect(openCircuitSpy).toHaveBeenCalledWith(1, 30_000);
  });

  it("enforces token rate limits", async () => {
    process.env.TOKEN_RATE_LIMIT_TPM = "1";
    process.env.TOKEN_RATE_LIMIT_BURST = "1";
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ id: "resp_ok" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    const first = await app.request("/codex/responses", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ model: "gpt-5.2", input: [] }),
    });
    const second = await app.request("/codex/responses", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ model: "gpt-5.2", input: [] }),
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
  });

  it("enforces key quotas", async () => {
    process.env.KEY_DAILY_TOKENS = "1";
    fetchMock.mockImplementation(
      async () =>
        new Response(JSON.stringify({ id: "resp_ok" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
    );

    const first = await app.request("/codex/responses", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ model: "gpt-5.2", input: [], max_output_tokens: 1 }),
    });
    const second = await app.request("/codex/responses", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ model: "gpt-5.2", input: [], max_output_tokens: 1 }),
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns the last retryable upstream response if every candidate fails", async () => {
    getAllCandidatesSpy.mockResolvedValue([providerA, providerB]);
    fetchMock
      .mockResolvedValueOnce(
        new Response('{"error":{"message":"Rate limit"}}', {
          status: 429,
          headers: { "content-type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response('{"error":{"message":"Quota exceeded"}}', {
          status: 402,
          headers: { "content-type": "application/json" },
        })
      );

    const res = await app.request("/codex/responses", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ model: "gpt-5.2", input: [] }),
    });

    expect(res.status).toBe(402);
    expect(await res.text()).toContain("Quota exceeded");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(recordFailureMock).toHaveBeenNthCalledWith(2, 2, "quota");
    expect(openCircuitSpy).toHaveBeenNthCalledWith(2, 2, 300_000);
  });

  it("marks provider recovering when the upstream stream fails after the first byte", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('data: {"id":"resp_1"}\n\n'));
            controller.error(new Error("socket timeout"));
          },
        }),
        {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        }
      )
    );

    const res = await app.request("/codex/responses", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ model: "gpt-5.2", input: [], stream: true }),
    });

    expect(res.status).toBe(200);
    await expect(res.text()).rejects.toThrow("socket timeout");
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(providerRecoveryService.isRecovering(providerA.id)).toBe(true);
    expect(providerRecoveryService.getEntry(providerA.id)?.probeModel).toBe("gpt-5.2");
    expect(openCircuitSpy).toHaveBeenCalledWith(providerA.id, 30_000);
    expect(createRequestLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: providerA.id,
        modelSlug: "gpt-5.2",
        result: "failure",
      })
    );
  });

  it("does not fail over on non-retryable provider errors", async () => {
    getAllCandidatesSpy.mockResolvedValue([providerA, providerB]);
    fetchMock.mockResolvedValueOnce(
      new Response('{"error":{"message":"Invalid request"}}', {
        status: 400,
        headers: { "content-type": "application/json" },
      })
    );

    const res = await app.request("/codex/responses", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ model: "gpt-5.2", input: [] }),
    });

    expect(res.status).toBe(400);
    expect(await res.text()).toContain("Invalid request");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(recordFailureMock).toHaveBeenCalledWith(1, "unknown");
  });
});
