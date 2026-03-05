import { CircuitBreaker } from "./circuitBreaker";
import { getActiveProvidersByModel } from "./modelService";

export class NoProviderAvailableError extends Error {
  constructor(modelSlug: string) {
    super(`No provider available for model: ${modelSlug}`);
    this.name = "NoProviderAvailableError";
  }
}

export class RouterService {
  constructor(private readonly breaker: CircuitBreaker) {}

  async getAllCandidates(modelSlug: string) {
    const providers = await getActiveProvidersByModel(modelSlug);
    return providers.filter((provider) => !this.breaker.isOpen(provider.id));
  }

  async selectProvider(modelSlug: string) {
    const candidates = await this.getAllCandidates(modelSlug);
    if (candidates.length === 0) {
      throw new NoProviderAvailableError(modelSlug);
    }
    return candidates[0];
  }
}
