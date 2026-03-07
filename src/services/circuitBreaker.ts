export class CircuitBreaker {
  private readonly openUntil = new Map<number, number>();

  open(providerId: number, cooldownMs: number) {
    this.openUntil.set(providerId, Date.now() + cooldownMs);
  }

  isOpen(providerId: number) {
    const until = this.openUntil.get(providerId);
    if (!until) return false;
    if (Date.now() >= until) {
      this.openUntil.delete(providerId);
      return false;
    }
    return true;
  }

  getOpenEntries() {
    const now = Date.now();
    const entries: { providerId: number; openUntil: number }[] = [];
    for (const [providerId, until] of this.openUntil.entries()) {
      if (now >= until) {
        this.openUntil.delete(providerId);
        continue;
      }
      entries.push({ providerId, openUntil: until });
    }
    return entries;
  }

  reset(providerId: number) {
    this.openUntil.delete(providerId);
  }
}
