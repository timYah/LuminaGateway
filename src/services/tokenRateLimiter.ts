type TokenRateOverride = {
  tpm?: number;
  burst?: number;
};

type TokenBucket = {
  tokens: number;
  lastRefill: number;
  tpm: number;
  burst: number;
};

function parseNumber(value: string | undefined) {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function parseOverrides(raw: string | undefined): Record<string, TokenRateOverride> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, TokenRateOverride>;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch (error) {
    console.warn("[token-limit] invalid TOKEN_RATE_LIMIT_OVERRIDES", error);
    return {};
  }
}

export class TokenRateLimiter {
  private readonly buckets = new Map<string, TokenBucket>();
  private cachedOverridesRaw: string | undefined;
  private cachedOverrides: Record<string, TokenRateOverride> = {};

  private resolveOverrides() {
    const raw = process.env.TOKEN_RATE_LIMIT_OVERRIDES;
    if (raw !== this.cachedOverridesRaw) {
      this.cachedOverridesRaw = raw;
      this.cachedOverrides = parseOverrides(raw);
    }
    return this.cachedOverrides;
  }

  private resolveConfig(identity: string) {
    const defaultTpm = parseNumber(process.env.TOKEN_RATE_LIMIT_TPM);
    if (!defaultTpm) return null;
    const defaultBurst = parseNumber(process.env.TOKEN_RATE_LIMIT_BURST) ?? defaultTpm;
    const overrides = this.resolveOverrides();
    const override = overrides[identity];
    const tpm = parseNumber(override?.tpm?.toString()) ?? defaultTpm;
    const burst = parseNumber(override?.burst?.toString()) ?? defaultBurst;
    return { tpm, burst };
  }

  consume(identity: string, tokens: number) {
    if (!identity) return { allowed: true, retryAfter: null as number | null };
    const config = this.resolveConfig(identity);
    if (!config) return { allowed: true, retryAfter: null as number | null };
    const now = Date.now();
    const ratePerMs = config.tpm / 60_000;
    const bucket = this.buckets.get(identity) ?? {
      tokens: config.burst,
      lastRefill: now,
      tpm: config.tpm,
      burst: config.burst,
    };

    const elapsed = Math.max(0, now - bucket.lastRefill);
    bucket.tokens = Math.min(bucket.burst, bucket.tokens + elapsed * ratePerMs);
    bucket.lastRefill = now;

    if (tokens <= 0) tokens = 1;
    if (bucket.tokens < tokens) {
      const retryAfter = Math.ceil((tokens - bucket.tokens) / ratePerMs / 1000);
      return { allowed: false, retryAfter };
    }

    bucket.tokens -= tokens;
    this.buckets.set(identity, bucket);
    return { allowed: true, retryAfter: null as number | null };
  }

  reset(identity?: string) {
    if (!identity) {
      this.buckets.clear();
      return;
    }
    this.buckets.delete(identity);
  }
}

export const tokenRateLimiter = new TokenRateLimiter();
