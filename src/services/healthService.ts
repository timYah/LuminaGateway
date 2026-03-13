import type { Provider } from "../db/schema/providers";
import {
  getAllProviders,
  getProviderById,
  updateProviderHealth,
} from "./providerService";
import {
  callUpstreamNonStreaming,
  classifyUpstreamError,
  getUpstreamErrorMessage,
  type UpstreamErrorType,
  type UpstreamRequestParams,
} from "./upstreamService";
import { gatewayCircuitBreaker } from "./gatewayService";
import {
  providerRecoveryService,
  type ProviderRecoveryEntry,
  type ProviderRecoveryProbeResult,
} from "./providerRecoveryService";

export type ProviderHealthCheckResult = {
  providerId: number;
  status: "healthy" | "unhealthy" | "unknown";
  latencyMs: number;
  model: string;
  errorType?: UpstreamErrorType;
  message?: string;
};

const HEALTHCHECK_MESSAGE: NonNullable<UpstreamRequestParams["messages"]> = [
  { role: "user", content: "ping" },
];

export async function checkProviderHealth(
  provider: Provider,
  modelSlug: string,
  options?: {
    recoverOnSuccess?: boolean;
    updateRecoveryFailure?: boolean;
  }
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
    if (options?.recoverOnSuccess) {
      gatewayCircuitBreaker.reset(provider.id, modelSlug);
      providerRecoveryService.reset(provider.id, modelSlug);
    }
    return {
      providerId: provider.id,
      status: "healthy",
      latencyMs,
      model: modelSlug,
    };
  } catch (error) {
    const latencyMs = Date.now() - start;
    const errorType = classifyUpstreamError(error);
    const message = getUpstreamErrorMessage(error);
    await updateProviderHealth(provider.id, "unhealthy");
    if (
      options?.updateRecoveryFailure &&
      providerRecoveryService.isRecovering(provider.id, modelSlug)
    ) {
      providerRecoveryService.recordProbeFailure(provider.id, modelSlug, {
        ok: false,
        errorType,
        message,
      });
    }
    return {
      providerId: provider.id,
      status: "unhealthy",
      latencyMs,
      model: modelSlug,
      errorType,
      message,
    };
  }
}

export async function runProvidersHealthCheck(
  modelSlug: string,
  options?: {
    recoverOnSuccess?: boolean;
  }
): Promise<ProviderHealthCheckResult[]> {
  const providers = await getAllProviders();
  if (providers.length === 0) return [];
  const checks = providers.map((provider) =>
    checkProviderHealth(provider, modelSlug, {
      recoverOnSuccess: options?.recoverOnSuccess,
      updateRecoveryFailure: true,
    })
  );
  return Promise.all(checks);
}

export async function runRecoveryProbe(
  entry: ProviderRecoveryEntry
): Promise<ProviderRecoveryProbeResult> {
  const provider = await getProviderById(entry.providerId);
  if (!provider || !provider.isActive) {
    providerRecoveryService.reset(entry.providerId);
    return { ok: true };
  }

  const result = await checkProviderHealth(provider, entry.probeModel, {
    recoverOnSuccess: true,
    updateRecoveryFailure: false,
  });

  if (result.status === "healthy") {
    return { ok: true };
  }

  return {
    ok: false,
    errorType: result.errorType ?? "unknown",
    message: result.message ?? null,
  };
}
