import { CircuitBreaker } from "./circuitBreaker";
import { getActiveProvidersByModel } from "./modelService";

export class RouterService {
  constructor(private readonly breaker: CircuitBreaker) {}

  async selectProvider(modelSlug: string) {
    const providers = await getActiveProvidersByModel(modelSlug);
    const candidates = providers.filter((provider) => !this.breaker.isOpen(provider.id));
    return candidates[0] ?? null;
  }
}
