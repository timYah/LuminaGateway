import { normalizeOpenAiCompatibleModelSlug } from "./modelSlug";

type CircuitBreakerEntry = {
  providerId: number;
  modelSlug: string | null;
  openUntil: number;
};

export class CircuitBreaker {
  private readonly openUntil = new Map<string, CircuitBreakerEntry>();

  private buildKey(providerId: number, modelSlug: string | null) {
    const normalizedModelSlug =
      modelSlug === null ? null : normalizeOpenAiCompatibleModelSlug(modelSlug) || null;
    return `${providerId}:${normalizedModelSlug ?? "*"}`;
  }

  open(providerId: number, cooldownMs: number, modelSlug?: string) {
    const normalizedModelSlug =
      modelSlug === undefined ? null : normalizeOpenAiCompatibleModelSlug(modelSlug) || null;
    const key = this.buildKey(providerId, normalizedModelSlug);
    this.openUntil.set(key, {
      providerId,
      modelSlug: normalizedModelSlug,
      openUntil: Date.now() + cooldownMs,
    });
  }

  private isEntryOpen(key: string, now: number) {
    const entry = this.openUntil.get(key);
    if (!entry) return false;
    if (now >= entry.openUntil) {
      this.openUntil.delete(key);
      return false;
    }
    return true;
  }

  isOpen(providerId: number, modelSlug?: string) {
    const now = Date.now();
    if (modelSlug) {
      return (
        this.isEntryOpen(this.buildKey(providerId, modelSlug), now) ||
        this.isEntryOpen(this.buildKey(providerId, null), now)
      );
    }
    let open = false;
    for (const [key, entry] of this.openUntil.entries()) {
      if (entry.providerId !== providerId) continue;
      if (now >= entry.openUntil) {
        this.openUntil.delete(key);
        continue;
      }
      open = true;
    }
    return open;
  }

  getOpenEntries() {
    const now = Date.now();
    const entries: CircuitBreakerEntry[] = [];
    for (const [key, entry] of this.openUntil.entries()) {
      if (now >= entry.openUntil) {
        this.openUntil.delete(key);
        continue;
      }
      entries.push(entry);
    }
    return entries;
  }

  reset(providerId: number, modelSlug?: string) {
    if (modelSlug) {
      this.openUntil.delete(this.buildKey(providerId, modelSlug));
      return;
    }
    for (const [key, entry] of this.openUntil.entries()) {
      if (entry.providerId === providerId) {
        this.openUntil.delete(key);
      }
    }
  }
}
