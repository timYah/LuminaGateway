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
  private readonly entries = new Map<number, ProviderRecoveryEntry>();

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

  reset(providerId: number) {
    this.entries.delete(providerId);
    this.scheduleNext();
  }

  resetAll() {
    this.entries.clear();
    this.scheduleNext();
  }

  isRecovering(providerId: number) {
    return this.entries.has(providerId);
  }

  getEntry(providerId: number) {
    return this.entries.get(providerId) ?? null;
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
  }) {
    const now = new Date();
    const existing = this.entries.get(input.providerId);
    const entry: ProviderRecoveryEntry = {
      providerId: input.providerId,
      triggerErrorType: input.errorType,
      probeModel: input.probeModel,
      startedAt: existing?.startedAt ?? now,
      nextProbeAt: this.buildNextProbeAt(now),
      lastProbeAt: existing?.lastProbeAt ?? null,
      lastProbeErrorType: existing?.lastProbeErrorType ?? null,
      lastProbeMessage: existing?.lastProbeMessage ?? null,
    };
    this.entries.set(input.providerId, entry);
    this.scheduleNext();
    return entry;
  }

  recordProbeFailure(providerId: number, result: Exclude<ProviderRecoveryProbeResult, { ok: true }>) {
    const entry = this.entries.get(providerId);
    if (!entry) return null;
    const now = new Date();
    const nextEntry: ProviderRecoveryEntry = {
      ...entry,
      lastProbeAt: now,
      lastProbeErrorType: result.errorType,
      lastProbeMessage: result.message,
      nextProbeAt: this.buildNextProbeAt(now),
    };
    this.entries.set(providerId, nextEntry);
    this.scheduleNext();
    return nextEntry;
  }

  private buildNextProbeAt(from: Date) {
    const nextProbeMs =
      from.getTime() + resolveProviderRecoveryIntervalMs() + randomRecoveryJitterMs();
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
      if (!this.entries.has(entry.providerId)) continue;
      try {
        const result = await handler(entry);
        if (result.ok) {
          this.entries.delete(entry.providerId);
        } else {
          this.recordProbeFailure(entry.providerId, result);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Recovery probe failed";
        this.recordProbeFailure(entry.providerId, {
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
