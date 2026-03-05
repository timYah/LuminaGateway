export class CircuitBreaker {
  private readonly openUntil = new Map<number, number>();

  open(providerId: number, cooldownMs: number) {
    this.openUntil.set(providerId, Date.now() + cooldownMs);
  }

  isOpen(providerId: number) {
    return this.openUntil.has(providerId);
  }
}
