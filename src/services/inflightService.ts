type InflightOverrides = Record<string, number>;

function parseNumber(value: string | undefined) {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function parseOverrides(raw: string | undefined): InflightOverrides {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as InflightOverrides;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch (error) {
    console.warn("[inflight] invalid PROVIDER_MAX_INFLIGHT_OVERRIDES", error);
    return {};
  }
}

export class InflightLimiter {
  private readonly counts = new Map<number, number>();
  private cachedOverridesRaw: string | undefined;
  private cachedOverrides: InflightOverrides = {};

  private resolveOverrides() {
    const raw = process.env.PROVIDER_MAX_INFLIGHT_OVERRIDES;
    if (raw !== this.cachedOverridesRaw) {
      this.cachedOverridesRaw = raw;
      this.cachedOverrides = parseOverrides(raw);
    }
    return this.cachedOverrides;
  }

  private resolveLimit(providerId: number, providerName?: string) {
    const overrides = this.resolveOverrides();
    const byId = overrides[String(providerId)];
    if (typeof byId === "number") return byId;
    if (providerName) {
      const byName = overrides[providerName];
      if (typeof byName === "number") return byName;
    }
    const fallback = parseNumber(process.env.PROVIDER_MAX_INFLIGHT);
    return fallback ?? null;
  }

  tryAcquire(providerId: number, providerName?: string) {
    const limit = this.resolveLimit(providerId, providerName);
    if (limit === null) return true;
    if (limit <= 0) return false;
    const current = this.counts.get(providerId) ?? 0;
    if (current >= limit) return false;
    this.counts.set(providerId, current + 1);
    return true;
  }

  release(providerId: number) {
    const current = this.counts.get(providerId) ?? 0;
    if (current <= 1) {
      this.counts.delete(providerId);
      return;
    }
    this.counts.set(providerId, current - 1);
  }

  reset(providerId?: number) {
    if (typeof providerId === "number") {
      this.counts.delete(providerId);
      return;
    }
    this.counts.clear();
  }
}

export const gatewayInflightLimiter = new InflightLimiter();
