import { CircuitBreaker } from "./circuitBreaker";
import { getActiveProvidersByModel } from "./modelService";
import { providerRecoveryService } from "./providerRecoveryService";

export class NoProviderAvailableError extends Error {
  constructor(modelSlug: string) {
    super(`No provider available for model: ${modelSlug}`);
    this.name = "NoProviderAvailableError";
  }
}

export class RouterService {
  private readonly roundRobinIndex = new Map<string, number>();

  constructor(
    private readonly breaker: CircuitBreaker,
    private readonly recovery = providerRecoveryService
  ) {}

  private resolveStrategy() {
    const raw = process.env.ROUTING_STRATEGY?.toLowerCase().trim();
    if (raw === "round_robin") return "round_robin";
    if (raw === "weighted") return "weighted";
    return "priority";
  }

  private resolveWeights(): Record<string, number> {
    const raw = process.env.PROVIDER_WEIGHTS;
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw) as Record<string, number>;
      if (!parsed || typeof parsed !== "object") return {};
      return parsed;
    } catch (error) {
      console.warn("[router] invalid PROVIDER_WEIGHTS", error);
      return {};
    }
  }

  private getWeight(
    provider: { id: number; name: string },
    weights: Record<string, number>
  ) {
    const byId = weights[String(provider.id)];
    if (typeof byId === "number") return byId;
    const byName = weights[provider.name];
    if (typeof byName === "number") return byName;
    return 1;
  }

  private applyRoundRobin<T extends { id: number }>(modelSlug: string, providers: T[]) {
    if (providers.length <= 1) return providers;
    const index = this.roundRobinIndex.get(modelSlug) ?? 0;
    const nextIndex = (index + 1) % providers.length;
    this.roundRobinIndex.set(modelSlug, nextIndex);
    if (index === 0) return providers;
    return providers.slice(index).concat(providers.slice(0, index));
  }

  private applyWeighted<T extends { id: number; name: string }>(providers: T[]) {
    if (providers.length <= 1) return providers;
    const weights = this.resolveWeights();
    const weighted = providers.map((provider) => ({
      provider,
      weight: this.getWeight(provider, weights),
    }));
    const total = weighted.reduce((sum, item) => sum + Math.max(0, item.weight), 0);
    if (total <= 0) return providers;
    let threshold = Math.random() * total;
    let selected = weighted[0]?.provider ?? providers[0];
    for (const item of weighted) {
      threshold -= Math.max(0, item.weight);
      if (threshold <= 0) {
        selected = item.provider;
        break;
      }
    }
    const remaining = providers.filter((provider) => provider.id !== selected.id);
    return [selected, ...remaining];
  }


  async getAllCandidates(modelSlug: string) {
    const providers = await getActiveProvidersByModel(modelSlug);
    const candidates = providers.filter(
      (provider) =>
        !this.breaker.isOpen(provider.id) && !this.recovery.isRecovering(provider.id)
    );
    if (candidates.length <= 1) return candidates;
    const strategy = this.resolveStrategy();
    if (strategy === "round_robin") {
      return this.applyRoundRobin(modelSlug, candidates);
    }
    if (strategy === "weighted") {
      return this.applyWeighted(candidates);
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
