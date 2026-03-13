import { deactivateProvider } from "./providerService";
import {
  providerRecoveryService,
  type RecoveryErrorType,
} from "./providerRecoveryService";
import type { CircuitBreaker } from "./circuitBreaker";
import type { UpstreamErrorType } from "./upstreamService";

export const MODEL_FAILURE_COOLDOWN_MS = 60_000;

function isRecoveryEligibleErrorType(
  errorType: UpstreamErrorType
): errorType is RecoveryErrorType {
  return (
    errorType === "quota" ||
    errorType === "rate_limit" ||
    errorType === "network" ||
    errorType === "server"
  );
}

export async function applyProviderFailurePolicy(input: {
  breaker: CircuitBreaker;
  providerId: number;
  modelSlug: string;
  errorType: UpstreamErrorType;
}): Promise<boolean> {
  const { breaker, providerId, modelSlug, errorType } = input;
  if (errorType === "quota") {
    breaker.open(providerId, MODEL_FAILURE_COOLDOWN_MS, modelSlug);
  } else if (errorType === "rate_limit") {
    breaker.open(providerId, MODEL_FAILURE_COOLDOWN_MS, modelSlug);
  } else if (errorType === "network" || errorType === "server") {
    breaker.open(providerId, MODEL_FAILURE_COOLDOWN_MS, modelSlug);
  } else if (errorType === "model_not_found") {
    breaker.open(providerId, MODEL_FAILURE_COOLDOWN_MS, modelSlug);
  }

  if (isRecoveryEligibleErrorType(errorType)) {
    providerRecoveryService.markRecovering({
      providerId,
      errorType,
      probeModel: modelSlug,
      intervalMs: MODEL_FAILURE_COOLDOWN_MS,
    });
    return true;
  }

  if (errorType === "auth") {
    await deactivateProvider(providerId);
    return true;
  }

  if (errorType === "model_not_found") {
    return true;
  }

  return false;
}
