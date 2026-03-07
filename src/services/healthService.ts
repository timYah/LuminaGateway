import type { Provider } from "../db/schema/providers";
import { getAllProviders, updateProviderHealth } from "./providerService";
import {
  callUpstreamNonStreaming,
  classifyUpstreamError,
  getUpstreamErrorMessage,
  type UpstreamErrorType,
  type UpstreamRequestParams,
} from "./upstreamService";

export type ProviderHealthCheckResult = {
  providerId: number;
  status: "healthy" | "unhealthy" | "unknown";
  latencyMs: number;
  errorType?: UpstreamErrorType;
  message?: string;
};

const HEALTHCHECK_MESSAGE: NonNullable<UpstreamRequestParams["messages"]> = [
  { role: "user", content: "ping" },
];

export async function checkProviderHealth(
  provider: Provider,
  modelSlug: string
): Promise<ProviderHealthCheckResult> {
  const start = Date.now();
  const testParams: UpstreamRequestParams = {
    messages: HEALTHCHECK_MESSAGE,
    maxOutputTokens: 1,
  };
  try {
    await callUpstreamNonStreaming(provider, modelSlug, testParams);
    const latencyMs = Date.now() - start;
    await updateProviderHealth(provider.id, "healthy");
    return {
      providerId: provider.id,
      status: "healthy",
      latencyMs,
    };
  } catch (error) {
    const latencyMs = Date.now() - start;
    const errorType = classifyUpstreamError(error);
    await updateProviderHealth(provider.id, "unhealthy");
    return {
      providerId: provider.id,
      status: "unhealthy",
      latencyMs,
      errorType,
      message: getUpstreamErrorMessage(error),
    };
  }
}

export async function runProvidersHealthCheck(
  modelSlug: string
): Promise<ProviderHealthCheckResult[]> {
  const providers = await getAllProviders();
  if (providers.length === 0) return [];
  const checks = providers.map((provider) =>
    checkProviderHealth(provider, modelSlug)
  );
  return Promise.all(checks);
}
