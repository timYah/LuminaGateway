import type { ContentfulStatusCode } from "hono/utils/http-status";

type CacheEntry = {
  expiresAt: number;
  status: ContentfulStatusCode;
  body: unknown;
};

export class ResponseCache {
  private readonly store = new Map<string, CacheEntry>();

  get(key: string) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() >= entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry;
  }

  set(key: string, entry: CacheEntry) {
    this.store.set(key, entry);
  }

  clear() {
    this.store.clear();
  }
}

function parseTtl(value: string | undefined) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.floor(parsed));
}

export function resolveCacheTtlMs(overrideHeader?: string | null) {
  const override = parseTtl(overrideHeader ?? undefined);
  if (override !== null) return override;
  return parseTtl(process.env.CACHE_TTL_MS);
}

export const responseCache = new ResponseCache();
