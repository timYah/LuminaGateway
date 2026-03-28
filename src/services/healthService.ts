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
import { normalizeOpenAiCompatibleModelSlug } from "./modelSlug";

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

const DEFAULT_HEALTHCHECK_FALLBACK_MODEL = "gpt-4o";

function normalizeModelName(value: string | null | undefined) {
  const normalized = normalizeOpenAiCompatibleModelSlug(value);
  return normalized || null;
}

export function resolveHealthCheckModel(
  provider: Provider,
  overrideModel?: string | null
) {
  return (
    normalizeModelName(overrideModel) ??
    normalizeModelName(provider.healthCheckModel) ??
    normalizeModelName(process.env.DEFAULT_HEALTHCHECK_MODEL) ??
    DEFAULT_HEALTHCHECK_FALLBACK_MODEL
  );
}

export async function checkProviderHealth(
  provider: Provider,
  modelSlug: string,
  options?: {
    recoverOnSuccess?: boolean;
    updateRecoveryFailure?: boolean;
    updateHealthStatus?: boolean;
  }
): Promise<ProviderHealthCheckResult> {
  const resolvedModelSlug = normalizeOpenAiCompatibleModelSlug(modelSlug);
  const start = Date.now();
  const testParams: UpstreamRequestParams = {
    messages: HEALTHCHECK_MESSAGE,
    maxOutputTokens: 1,
  };
  const shouldUpdateHealth = options?.updateHealthStatus ?? true;
  try {
    await callUpstreamNonStreaming(provider, resolvedModelSlug, testParams);
    const latencyMs = Date.now() - start;
    if (shouldUpdateHealth) {
      await updateProviderHealth(provider.id, "healthy");
    }
    if (options?.recoverOnSuccess) {
      gatewayCircuitBreaker.reset(provider.id, resolvedModelSlug);
      providerRecoveryService.reset(provider.id, resolvedModelSlug);
    }
    return {
      providerId: provider.id,
      status: "healthy",
      latencyMs,
      model: resolvedModelSlug,
    };
  } catch (error) {
    const latencyMs = Date.now() - start;
    const errorType = classifyUpstreamError(error);
    const message = getUpstreamErrorMessage(error);
    const isModelNotFound = errorType === "model_not_found";
    if (shouldUpdateHealth && !isModelNotFound) {
      await updateProviderHealth(provider.id, "unhealthy");
    }
    if (
      options?.updateRecoveryFailure &&
      providerRecoveryService.isRecovering(provider.id, resolvedModelSlug)
    ) {
      providerRecoveryService.recordProbeFailure(provider.id, resolvedModelSlug, {
        ok: false,
        errorType,
        message,
      });
    }
    return {
      providerId: provider.id,
      status: isModelNotFound ? "unknown" : "unhealthy",
      latencyMs,
      model: resolvedModelSlug,
      errorType,
      message,
    };
  }
}

export async function runProvidersHealthCheck(
  modelSlug: string | null | undefined,
  options?: {
    recoverOnSuccess?: boolean;
  }
): Promise<ProviderHealthCheckResult[]> {
  const providers = await getAllProviders();
  if (providers.length === 0) return [];
  const checks = providers.map((provider) =>
    checkProviderHealth(provider, resolveHealthCheckModel(provider, modelSlug), {
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
    providerName: provider.name,
    providerProtocol: provider.protocol,
  };
}
