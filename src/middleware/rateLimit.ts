import type { MiddlewareHandler } from "hono";

type RateLimitConfig = {
  rpm: number;
  burst: number;
};

type Bucket = {
  tokens: number;
  lastRefill: number;
  rpm: number;
  burst: number;
};

type RateLimitOverrides = Record<string, { rpm?: number; burst?: number }>;

function normalizeKey(raw: string | undefined) {
  let value = (raw ?? "").trim();
  if (!value) return "";

  const lower = value.toLowerCase();
  if (lower.startsWith("authorization:")) {
    value = value.slice("authorization:".length).trim();
  }
  if (value.toLowerCase().startsWith("bearer ")) {
    value = value.slice("bearer ".length).trim();
  }

  const match = value.match(/^([A-Z0-9_]+)\s*=\s*(.+)$/i);
  if (match && match[1].toUpperCase() === "GATEWAY_API_KEY") {
    value = match[2].trim();
  }

  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }

  return value;
}

function parseNumber(value: string | undefined) {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function parseOverrides(raw: string | undefined): RateLimitOverrides {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as RateLimitOverrides;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch (error) {
    console.warn("[rate-limit] failed to parse RATE_LIMIT_OVERRIDES", error);
    return {};
  }
}

function getConfigForToken(token: string, overrides: RateLimitOverrides): RateLimitConfig | null {
  const defaultRpm = parseNumber(process.env.RATE_LIMIT_RPM);
  if (!defaultRpm) return null;
  const defaultBurst = parseNumber(process.env.RATE_LIMIT_BURST) ?? defaultRpm;

  const override = overrides[token];
  const rpm = parseNumber(override?.rpm?.toString()) ?? defaultRpm;
  const burst = parseNumber(override?.burst?.toString()) ?? defaultBurst;
  if (!rpm || !burst) return null;
  return { rpm, burst };
}

export const rateLimitMiddleware = (): MiddlewareHandler => {
  const buckets = new Map<string, Bucket>();
  let cachedOverridesRaw: string | undefined;
  let cachedOverrides: RateLimitOverrides = {};

  return async (c, next) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) {
      await next();
      return;
    }

    const token = normalizeKey(authHeader);
    if (!token) {
      await next();
      return;
    }

    const rawOverrides = process.env.RATE_LIMIT_OVERRIDES;
    if (rawOverrides !== cachedOverridesRaw) {
      cachedOverridesRaw = rawOverrides;
      cachedOverrides = parseOverrides(rawOverrides);
    }

    const config = getConfigForToken(token, cachedOverrides);
    if (!config) {
      await next();
      return;
    }

    const now = Date.now();
    const ratePerMs = config.rpm / 60_000;
    const existing = buckets.get(token);
    const bucket: Bucket = existing ?? {
      tokens: config.burst,
      lastRefill: now,
      rpm: config.rpm,
      burst: config.burst,
    };

    const elapsed = Math.max(0, now - bucket.lastRefill);
    bucket.tokens = Math.min(bucket.burst, bucket.tokens + elapsed * ratePerMs);
    bucket.lastRefill = now;

    if (bucket.tokens < 1) {
      const retryAfter = Math.ceil((1 - bucket.tokens) / ratePerMs / 1000);
      return c.json(
        { error: { message: "Rate limit exceeded" } },
        429,
        { "Retry-After": retryAfter.toString() }
      );
    }

    bucket.tokens -= 1;
    buckets.set(token, bucket);

    await next();
  };
};
