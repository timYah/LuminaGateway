import { CircuitBreaker } from "./circuitBreaker";
import { getActiveProvidersByModel } from "./modelService";

export class RouterService {
  constructor(private readonly breaker: CircuitBreaker) {}

  async selectProvider(modelSlug: string) {
    const providers = await getActiveProvidersByModel(modelSlug);
    return providers[0] ?? null;
  }
}
