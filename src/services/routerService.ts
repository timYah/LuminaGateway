import { CircuitBreaker } from "./circuitBreaker";
import { getActiveProvidersByModel } from "./modelService";

export class NoProviderAvailableError extends Error {
  constructor(modelSlug: string) {
    super(`No provider available for model: ${modelSlug}`);
    this.name = "NoProviderAvailableError";
  }
}

export class RouterService {
  private readonly roundRobinIndex = new Map<string, number>();

  constructor(private readonly breaker: CircuitBreaker) {}

  private resolveStrategy() {
    const raw = process.env.ROUTING_STRATEGY?.toLowerCase().trim();
    if (raw === "round_robin") return "round_robin";
    return "priority";
  }

  private applyRoundRobin<T extends { id: number }>(modelSlug: string, providers: T[]) {
    if (providers.length <= 1) return providers;
    const index = this.roundRobinIndex.get(modelSlug) ?? 0;
    const nextIndex = (index + 1) % providers.length;
    this.roundRobinIndex.set(modelSlug, nextIndex);
    if (index === 0) return providers;
    return providers.slice(index).concat(providers.slice(0, index));
  }


  async getAllCandidates(modelSlug: string) {
    const providers = await getActiveProvidersByModel(modelSlug);
    const candidates = providers.filter((provider) => !this.breaker.isOpen(provider.id));
    if (candidates.length <= 1) return candidates;
    const strategy = this.resolveStrategy();
    if (strategy === "round_robin") {
      return this.applyRoundRobin(modelSlug, candidates);
    }
    return candidates;
  }

  async selectProvider(modelSlug: string) {
    const candidates = await this.getAllCandidates(modelSlug);
    if (candidates.length === 0) {
      throw new NoProviderAvailableError(modelSlug);
    }
    return candidates[0];
  }
}
