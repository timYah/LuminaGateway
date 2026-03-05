import { CircuitBreaker } from "./circuitBreaker";
import { getActiveProvidersByModel } from "./modelService";

export class RouterService {
  constructor(private readonly breaker: CircuitBreaker) {}

  async getAllCandidates(modelSlug: string) {
    const providers = await getActiveProvidersByModel(modelSlug);
    return providers.filter((provider) => !this.breaker.isOpen(provider.id));
  }

  async selectProvider(modelSlug: string) {
    const candidates = await this.getAllCandidates(modelSlug);
    return candidates[0] ?? null;
  }
}
