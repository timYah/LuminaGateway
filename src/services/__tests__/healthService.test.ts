import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkProviderHealth,
  runProvidersHealthCheck,
} from "../healthService";

const callUpstreamNonStreaming = vi.fn();
const classifyUpstreamError = vi.fn();

vi.mock("../upstreamService", () => ({
  callUpstreamNonStreaming: (...args: unknown[]) => callUpstreamNonStreaming(...args),
  classifyUpstreamError: (...args: unknown[]) => classifyUpstreamError(...args),
}));

const updateProviderHealth = vi.fn();
const getAllProviders = vi.fn();

vi.mock("../providerService", () => ({
  updateProviderHealth: (...args: unknown[]) => updateProviderHealth(...args),
  getAllProviders: (...args: unknown[]) => getAllProviders(...args),
}));

const provider = {
  id: 1,
  name: "Health Provider",
  protocol: "openai" as const,
  baseUrl: "https://example.com",
  apiKey: "sk-test",
  apiMode: "responses" as const,
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

describe("healthService", () => {
  beforeEach(() => {
    callUpstreamNonStreaming.mockReset();
    classifyUpstreamError.mockReset();
    updateProviderHealth.mockReset();
    getAllProviders.mockReset();
  });

  it("marks provider healthy when probe succeeds", async () => {
    callUpstreamNonStreaming.mockResolvedValue({ result: {}, usage: {} });

    const result = await checkProviderHealth(provider, "gpt-4o");

    expect(result.status).toBe("healthy");
    expect(updateProviderHealth).toHaveBeenCalledWith(provider.id, "healthy");
  });

  it("marks provider unhealthy when probe fails", async () => {
    callUpstreamNonStreaming.mockRejectedValue(new Error("boom"));
    classifyUpstreamError.mockReturnValue("server");

    const result = await checkProviderHealth(provider, "gpt-4o");

    expect(result.status).toBe("unhealthy");
    expect(result.errorType).toBe("server");
    expect(updateProviderHealth).toHaveBeenCalledWith(provider.id, "unhealthy");
  });

  it("runs health checks for all providers", async () => {
    getAllProviders.mockResolvedValue([provider]);
    callUpstreamNonStreaming.mockResolvedValue({ result: {}, usage: {} });

    const results = await runProvidersHealthCheck("gpt-4o");

    expect(results).toHaveLength(1);
    expect(results[0].providerId).toBe(provider.id);
    expect(updateProviderHealth).toHaveBeenCalledWith(provider.id, "healthy");
  });
});
