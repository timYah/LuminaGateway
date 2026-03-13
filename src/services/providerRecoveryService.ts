import type { UpstreamErrorType } from "./upstreamService";

export type RecoveryErrorType = Extract<
  UpstreamErrorType,
  "quota" | "rate_limit" | "server" | "network"
>;

export type ProviderRecoveryEntry = {
  providerId: number;
  triggerErrorType: RecoveryErrorType;
  probeModel: string;
  startedAt: Date;
  nextProbeAt: Date;
  lastProbeAt: Date | null;
  lastProbeErrorType: UpstreamErrorType | null;
  lastProbeMessage: string | null;
  intervalMs: number;
};

export type ProviderRecoveryProbeResult =
  | { ok: true }
  | {
      ok: false;
      errorType: UpstreamErrorType;
      message: string | null;
    };

export type ProviderRecoveryProbeHandler = (
  entry: ProviderRecoveryEntry
) => Promise<ProviderRecoveryProbeResult>;

const DEFAULT_RECOVERY_INTERVAL_MS = 300_000;
const RECOVERY_JITTER_MIN_MS = 1_000;
const RECOVERY_JITTER_MAX_MS = 10_000;

function parseInterval(raw: string | undefined) {
  if (!raw) return DEFAULT_RECOVERY_INTERVAL_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_RECOVERY_INTERVAL_MS;
  }
  return Math.floor(parsed);
}

export function resolveProviderRecoveryIntervalMs() {
  return parseInterval(process.env.PROVIDER_RECOVERY_CHECK_INTERVAL_MS);
}

export function randomRecoveryJitterMs() {
  const span = RECOVERY_JITTER_MAX_MS - RECOVERY_JITTER_MIN_MS + 1;
  return Math.floor(Math.random() * span) + RECOVERY_JITTER_MIN_MS;
}

export class ProviderRecoveryService {
  private readonly entries = new Map<string, ProviderRecoveryEntry>();

  private timeoutId: ReturnType<typeof setTimeout> | null = null;

  private probeHandler: ProviderRecoveryProbeHandler | null = null;

  start(probeHandler: ProviderRecoveryProbeHandler) {
    this.probeHandler = probeHandler;
    this.scheduleNext();
  }

  stop() {
    this.probeHandler = null;
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  private buildKey(providerId: number, modelSlug: string) {
    return `${providerId}:${modelSlug}`;
  }

  private resolveInterval(inputInterval?: number, existingInterval?: number) {
    if (typeof inputInterval === "number" && Number.isFinite(inputInterval) && inputInterval >= 0) {
      return Math.floor(inputInterval);
    }
    if (typeof existingInterval === "number") return existingInterval;
    return resolveProviderRecoveryIntervalMs();
  }

  reset(providerId: number, modelSlug?: string) {
    if (modelSlug) {
      this.entries.delete(this.buildKey(providerId, modelSlug));
      this.scheduleNext();
      return;
    }
    for (const [key, entry] of this.entries.entries()) {
      if (entry.providerId === providerId) {
        this.entries.delete(key);
      }
    }
    this.scheduleNext();
  }

  resetAll() {
    this.entries.clear();
    this.scheduleNext();
  }

  isRecovering(providerId: number, modelSlug?: string) {
    if (modelSlug) {
      return this.entries.has(this.buildKey(providerId, modelSlug));
    }
    for (const entry of this.entries.values()) {
      if (entry.providerId === providerId) return true;
    }
    return false;
  }

  getEntry(providerId: number, modelSlug?: string) {
    if (modelSlug) {
      return this.entries.get(this.buildKey(providerId, modelSlug)) ?? null;
    }
    const entries = this.getEntries().filter((entry) => entry.providerId === providerId);
    return entries[0] ?? null;
  }

  getEntries() {
    return [...this.entries.values()].sort(
      (left, right) => left.nextProbeAt.getTime() - right.nextProbeAt.getTime()
    );
  }

  markRecovering(input: {
    providerId: number;
    errorType: RecoveryErrorType;
    probeModel: string;
    intervalMs?: number;
  }) {
    const now = new Date();
    const key = this.buildKey(input.providerId, input.probeModel);
    const existing = this.entries.get(key);
    const intervalMs = this.resolveInterval(input.intervalMs, existing?.intervalMs);
    const entry: ProviderRecoveryEntry = {
      providerId: input.providerId,
      triggerErrorType: input.errorType,
      probeModel: input.probeModel,
      startedAt: existing?.startedAt ?? now,
      nextProbeAt: this.buildNextProbeAt(now, intervalMs),
      lastProbeAt: existing?.lastProbeAt ?? null,
      lastProbeErrorType: existing?.lastProbeErrorType ?? null,
      lastProbeMessage: existing?.lastProbeMessage ?? null,
      intervalMs,
    };
    this.entries.set(key, entry);
    this.scheduleNext();
    return entry;
  }

  recordProbeFailure(
    providerId: number,
    modelSlug: string,
    result: Exclude<ProviderRecoveryProbeResult, { ok: true }>
  ) {
    const key = this.buildKey(providerId, modelSlug);
    const entry = this.entries.get(key);
    if (!entry) return null;
    const now = new Date();
    const nextEntry: ProviderRecoveryEntry = {
      ...entry,
      lastProbeAt: now,
      lastProbeErrorType: result.errorType,
      lastProbeMessage: result.message,
      nextProbeAt: this.buildNextProbeAt(now, entry.intervalMs),
    };
    this.entries.set(key, nextEntry);
    this.scheduleNext();
    return nextEntry;
  }

  private buildNextProbeAt(from: Date, intervalMs: number) {
    const nextProbeMs = from.getTime() + intervalMs + randomRecoveryJitterMs();
    return new Date(nextProbeMs);
  }

  private scheduleNext() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    if (!this.probeHandler || this.entries.size === 0) {
      return;
    }

    const nextEntry = this.getEntries()[0];
    if (!nextEntry) return;

    const delayMs = Math.max(nextEntry.nextProbeAt.getTime() - Date.now(), 0);
    this.timeoutId = setTimeout(() => {
      this.timeoutId = null;
      void this.runDueProbes();
    }, delayMs);
  }

  private async runDueProbes() {
    const handler = this.probeHandler;
    if (!handler) return;

    const now = Date.now();
    const dueEntries = this.getEntries().filter(
      (entry) => entry.nextProbeAt.getTime() <= now
    );

    for (const entry of dueEntries) {
      const key = this.buildKey(entry.providerId, entry.probeModel);
      if (!this.entries.has(key)) continue;
      try {
        const result = await handler(entry);
        if (result.ok) {
          this.entries.delete(key);
        } else {
          this.recordProbeFailure(entry.providerId, entry.probeModel, result);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Recovery probe failed";
        this.recordProbeFailure(entry.providerId, entry.probeModel, {
          ok: false,
          errorType: "unknown",
          message,
        });
      }
    }

    this.scheduleNext();
  }
}

export const providerRecoveryService = new ProviderRecoveryService();
