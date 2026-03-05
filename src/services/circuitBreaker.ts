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

  reset(providerId: number) {
    this.openUntil.delete(providerId);
  }
}
