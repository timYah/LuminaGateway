import type { UpstreamErrorType } from "./upstreamService";

const FAILURE_REASONS = [
  "quota",
  "rate_limit",
  "server",
  "auth",
  "model_not_found",
  "network",
  "unknown",
] as const;

export type FailureReason = (typeof FAILURE_REASONS)[number];

export type FailureStats = Record<FailureReason, number>;

const createEmptyStats = (): FailureStats => ({
  quota: 0,
  rate_limit: 0,
  server: 0,
  auth: 0,
  model_not_found: 0,
  network: 0,
  unknown: 0,
});

const providerStats = new Map<number, FailureStats>();
let totalStats: FailureStats = createEmptyStats();

function ensureStats(target?: FailureStats) {
  return target ?? createEmptyStats();
}

function normalizeReason(reason: UpstreamErrorType): FailureReason {
  if (FAILURE_REASONS.includes(reason as FailureReason)) {
    return reason as FailureReason;
  }
  return "unknown";
}

export function recordFailure(providerId: number, reason: UpstreamErrorType) {
  const normalized = normalizeReason(reason);
  const current = ensureStats(providerStats.get(providerId));
  current[normalized] += 1;
  providerStats.set(providerId, current);
  totalStats = {
    ...totalStats,
    [normalized]: totalStats[normalized] + 1,
  };
}

export function getFailureStats() {
  const providers: Record<string, FailureStats> = {};
  for (const [providerId, stats] of providerStats.entries()) {
    providers[String(providerId)] = { ...stats };
  }
  return {
    total: { ...totalStats },
    providers,
  };
}

export function resetFailureStats() {
  providerStats.clear();
  totalStats = createEmptyStats();
}
