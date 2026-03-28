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

vi.mock("../../services/usageLogService", async () => {
  const actual = await vi.importActual<typeof import("../../services/usageLogService")>(
    "../../services/usageLogService"
  );
  return {
    ...actual,
    persistEstimatedUsageLog: vi.fn(async () => null),
  };
});

import { createApp } from "../../app";
import { gatewayCircuitBreaker, gatewayRouter } from "../../services/gatewayService";
import { providerRecoveryService } from "../../services/providerRecoveryService";
import { groupQuotaTracker, keyQuotaTracker, userQuotaTracker } from "../../services/quotaService";
import * as usageLogService from "../../services/usageLogService";

process.env.GATEWAY_API_KEY = "test-key";

const app = createApp();
const authHeaders = {
  Authorization: "Bearer test-key",
  "Content-Type": "application/json",
};

const openaiProvider = {
  id: 1,
  name: "OpenAI",
  protocol: "openai" as const,
  baseUrl: "https://api.openai.com",
  apiKey: "sk-openai",
  apiMode: "responses" as const,
  codexTransform: false,
  balance: 0,
  inputPrice: null,
  outputPrice: null,
  isActive: true,
  priority: 1,
  healthCheckModel: null,
  healthStatus: "unknown" as const,
  lastHealthCheckAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const anthropicProvider = {
  ...openaiProvider,
  id: 2,
  name: "Anthropic",
  protocol: "anthropic" as const,
  baseUrl: "https://api.anthropic.com",
  apiKey: "sk-anthropic",
};

const geminiProvider = {
  ...openaiProvider,
  id: 3,
  name: "Gemini",
  protocol: "google" as const,
  baseUrl: "https://generativelanguage.googleapis.com",
  apiKey: "sk-gemini",
};

const fetchMock = vi.fn<typeof fetch>();
const getAllCandidatesSpy = vi.spyOn(gatewayRouter, "getAllCandidates");
const openCircuitSpy = vi.spyOn(gatewayCircuitBreaker, "open");
const persistEstimatedUsageLogMock = vi.mocked(usageLogService.persistEstimatedUsageLog);

beforeAll(() => {
  vi.stubGlobal("fetch", fetchMock);
});

describe("convert routes", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    getAllCandidatesSpy.mockReset();
    openCircuitSpy.mockClear();
    persistEstimatedUsageLogMock.mockClear();
    providerRecoveryService.resetAll();
    providerRecoveryService.stop();
  });

  afterEach(() => {
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

  it("converts anthropic response to openai responses", async () => {
    getAllCandidatesSpy.mockResolvedValue([openaiProvider]);
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "msg_1",
          type: "message",
          role: "assistant",
          content: [{ type: "text", text: "Hello" }],
          model: "claude-3",
          stop_reason: "end_turn",
          usage: { input_tokens: 1, output_tokens: 2 },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        }
      )
    );

    const res = await app.request("/convert/openai/v1/responses", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ model: "gpt-5.2", input: [] }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.object).toBe("response");
    expect(data.output_text).toBe("Hello");
    expect(persistEstimatedUsageLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: openaiProvider,
        modelSlug: "gpt-5.2",
        inputTokens: 0,
        outputTokens: 0,
        routePath: "/convert/openai/v1/responses",
        requestId: expect.any(String),
        costUsd: 0,
      })
    );
  });

  it("converts openai responses to anthropic", async () => {
    getAllCandidatesSpy.mockResolvedValue([anthropicProvider]);
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "resp_1",
          object: "response",
          created_at: 123,
          status: "completed",
          model: "gpt-5.2",
          error: null,
          incomplete_details: null,
          output_text: "Hello",
          output: [
            {
              id: "msg_1",
              type: "message",
              role: "assistant",
              status: "completed",
              content: [{ type: "output_text", text: "Hello", annotations: [] }],
            },
          ],
          usage: { input_tokens: 1, output_tokens: 2, total_tokens: 3 },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        }
      )
    );

    const res = await app.request("/convert/claude/v1/messages", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ model: "claude-3", messages: [] }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.type).toBe("message");
    expect(data.content[0]?.text).toBe("Hello");
  });

  it("converts openai responses to gemini", async () => {
    getAllCandidatesSpy.mockResolvedValue([geminiProvider]);
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "resp_1",
          object: "response",
          created_at: 123,
          status: "completed",
          model: "gpt-5.2",
          error: null,
          incomplete_details: null,
          output_text: "Hello",
          output: [
            {
              id: "msg_1",
              type: "message",
              role: "assistant",
              status: "completed",
              content: [{ type: "output_text", text: "Hello", annotations: [] }],
            },
          ],
          usage: { input_tokens: 1, output_tokens: 2, total_tokens: 3 },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        }
      )
    );

    const res = await app.request(
      "/convert/google/v1beta/models/gemini-1.5-pro:generateContent",
      {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ contents: [] }),
      }
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.candidates[0]?.content.parts[0]?.text).toBe("Hello");
  });

  it("returns 422 when response format is unrecognized", async () => {
    getAllCandidatesSpy.mockResolvedValue([openaiProvider]);
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ foo: "bar" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    const res = await app.request("/convert/openai/v1/responses", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ model: "gpt-5.2", input: [] }),
    });

    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.error?.message).toBe("Unrecognized response format");
    expect(persistEstimatedUsageLogMock).not.toHaveBeenCalled();
  });
});
