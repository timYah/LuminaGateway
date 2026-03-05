import { CircuitBreaker } from "./circuitBreaker";
import { RouterService } from "./routerService";
import { callUpstreamNonStreaming, classifyUpstreamError } from "./upstreamService";
import type { UpstreamRequestParams } from "./upstreamService";
import { getModelByProviderAndSlug } from "./modelService";
import { deactivateProvider, updateProvider } from "./providerService";

export type ClientFormat = "openai" | "anthropic";

export type GatewayRequestParams = UpstreamRequestParams & {
  model: string;
};

const RATE_LIMIT_COOLDOWN_MS = 60_000;
const SERVER_COOLDOWN_MS = 30_000;

export const gatewayCircuitBreaker = new CircuitBreaker();
export const gatewayRouter = new RouterService(gatewayCircuitBreaker);

export async function handleRequest(
  requestParams: GatewayRequestParams,
  _clientFormat: ClientFormat
) {
  const { model: modelSlug, ...params } = requestParams;
  const candidates = await gatewayRouter.getAllCandidates(modelSlug);
  let lastError: unknown = null;

  for (const provider of candidates) {
    const model = await getModelByProviderAndSlug(provider.id, modelSlug);
    if (!model) continue;
    try {
      const result = await callUpstreamNonStreaming(provider, model, params);
      return {
        status: 200,
        body: result,
      };
    } catch (error) {
      lastError = error;
      const errorType = classifyUpstreamError(error);
      if (errorType === "quota") {
        await updateProvider(provider.id, { balance: 0 });
        continue;
      }
      if (errorType === "rate_limit") {
        gatewayCircuitBreaker.open(provider.id, RATE_LIMIT_COOLDOWN_MS);
        continue;
      }
      if (errorType === "auth") {
        await deactivateProvider(provider.id);
        continue;
      }
      if (errorType === "server") {
        gatewayCircuitBreaker.open(provider.id, SERVER_COOLDOWN_MS);
        continue;
      }
      throw error;
    }
  }

  if (lastError) {
    throw lastError;
  }
  throw new Error(`No provider available for model: ${modelSlug}`);
}
