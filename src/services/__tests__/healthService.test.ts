import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkProviderHealth,
  runRecoveryProbe,
  runProvidersHealthCheck,
} from "../healthService";

const callUpstreamNonStreaming = vi.fn();
const classifyUpstreamError = vi.fn();
const getUpstreamErrorMessage = vi.fn();
const breakerReset = vi.fn();
const recoveryReset = vi.fn();
const recoveryIsRecovering = vi.fn();
const recordProbeFailure = vi.fn();

vi.mock("../gatewayService", () => ({
  gatewayCircuitBreaker: {
    reset: (...args: unknown[]) => breakerReset(...args),
  },
}));

vi.mock("../providerRecoveryService", () => ({
  providerRecoveryService: {
    reset: (...args: unknown[]) => recoveryReset(...args),
    isRecovering: (...args: unknown[]) => recoveryIsRecovering(...args),
    recordProbeFailure: (...args: unknown[]) => recordProbeFailure(...args),
  },
}));

vi.mock("../upstreamService", () => ({
  callUpstreamNonStreaming: (...args: unknown[]) => callUpstreamNonStreaming(...args),
  classifyUpstreamError: (...args: unknown[]) => classifyUpstreamError(...args),
  getUpstreamErrorMessage: (...args: unknown[]) => getUpstreamErrorMessage(...args),
}));

const updateProviderHealth = vi.fn();
const getAllProviders = vi.fn();
const getProviderById = vi.fn();

vi.mock("../providerService", () => ({
  updateProviderHealth: (...args: unknown[]) => updateProviderHealth(...args),
  getAllProviders: (...args: unknown[]) => getAllProviders(...args),
  getProviderById: (...args: unknown[]) => getProviderById(...args),
}));

const provider = {
  id: 1,
  name: "Health Provider",
  protocol: "openai" as const,
  baseUrl: "https://example.com",
  apiKey: "sk-test",
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

describe("healthService", () => {
  beforeEach(() => {
    callUpstreamNonStreaming.mockReset();
    classifyUpstreamError.mockReset();
    getUpstreamErrorMessage.mockReset();
    updateProviderHealth.mockReset();
    getAllProviders.mockReset();
    getProviderById.mockReset();
    breakerReset.mockReset();
    recoveryReset.mockReset();
    recoveryIsRecovering.mockReset();
    recordProbeFailure.mockReset();
  });

  it("marks provider healthy when probe succeeds", async () => {
    callUpstreamNonStreaming.mockResolvedValue({ result: {}, usage: {} });

    const result = await checkProviderHealth(provider, "gpt-4o");

    expect(result.status).toBe("healthy");
    expect(updateProviderHealth).toHaveBeenCalledWith(provider.id, "healthy");
  });

  it("resets breaker and recovery state when a recoverable provider probe succeeds", async () => {
    callUpstreamNonStreaming.mockResolvedValue({ result: {}, usage: {} });

    const result = await checkProviderHealth(provider, "gpt-4o", {
      recoverOnSuccess: true,
    });

    expect(result.status).toBe("healthy");
    expect(breakerReset).toHaveBeenCalledWith(provider.id, "gpt-4o");
    expect(recoveryReset).toHaveBeenCalledWith(provider.id, "gpt-4o");
  });

  it("marks provider unhealthy when probe fails", async () => {
    callUpstreamNonStreaming.mockRejectedValue(new Error("boom"));
    classifyUpstreamError.mockReturnValue("server");
    getUpstreamErrorMessage.mockReturnValue("downstream failed");

    const result = await checkProviderHealth(provider, "gpt-4o");

    expect(result.status).toBe("unhealthy");
    expect(result.errorType).toBe("server");
    expect(result.message).toBe("downstream failed");
    expect(updateProviderHealth).toHaveBeenCalledWith(provider.id, "unhealthy");
  });

  it("returns unknown and does not update health on model_not_found", async () => {
    callUpstreamNonStreaming.mockRejectedValue(new Error("boom"));
    classifyUpstreamError.mockReturnValue("model_not_found");
    getUpstreamErrorMessage.mockReturnValue("model missing");

    const result = await checkProviderHealth(provider, "bad-model");

    expect(result.status).toBe("unknown");
    expect(result.errorType).toBe("model_not_found");
    expect(updateProviderHealth).not.toHaveBeenCalled();
  });

  it("updates recovery probe metadata when a recovering provider probe fails", async () => {
    callUpstreamNonStreaming.mockRejectedValue(new Error("boom"));
    classifyUpstreamError.mockReturnValue("server");
    getUpstreamErrorMessage.mockReturnValue("downstream failed");
    recoveryIsRecovering.mockReturnValue(true);

    await checkProviderHealth(provider, "gpt-4o", {
      updateRecoveryFailure: true,
    });

    expect(recordProbeFailure).toHaveBeenCalledWith(provider.id, "gpt-4o", {
      ok: false,
      errorType: "server",
      message: "downstream failed",
    });
  });

  it("runs health checks for all providers", async () => {
    getAllProviders.mockResolvedValue([provider]);
    callUpstreamNonStreaming.mockResolvedValue({ result: {}, usage: {} });

    const results = await runProvidersHealthCheck("gpt-4o");

    expect(results).toHaveLength(1);
    expect(results[0].providerId).toBe(provider.id);
    expect(updateProviderHealth).toHaveBeenCalledWith(provider.id, "healthy");
  });

  it("includes provider context in recovery probe failures", async () => {
    getProviderById.mockResolvedValue(provider);
    callUpstreamNonStreaming.mockRejectedValue(new Error("boom"));
    classifyUpstreamError.mockReturnValue("unknown");
    getUpstreamErrorMessage.mockReturnValue("unknown provider for model 1");

    const result = await runRecoveryProbe({
      providerId: provider.id,
      triggerErrorType: "server",
      probeModel: "gpt-4o",
      startedAt: new Date("2026-03-28T09:00:00.000Z"),
      nextProbeAt: new Date("2026-03-28T09:05:00.000Z"),
      lastProbeAt: null,
      lastProbeErrorType: null,
      lastProbeMessage: null,
      intervalMs: 10_000,
      attempts: 0,
    });

    expect(result).toEqual({
      ok: false,
      errorType: "unknown",
      message: "unknown provider for model 1",
      providerName: "Health Provider",
      providerProtocol: "openai",
    });
  });
});
