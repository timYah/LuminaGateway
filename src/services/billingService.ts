import { usageLogs } from "../db/schema/usageLogs";
import { getSqliteClient } from "../db";
import type { UpstreamUsage } from "./upstreamService";
import type { Provider } from "../db/schema/providers";

export function calculateCost(
  inputTokens: number,
  outputTokens: number,
  inputPrice: number,
  outputPrice: number
) {
  const inputCost = (inputTokens / 1_000_000) * inputPrice;
  const outputCost = (outputTokens / 1_000_000) * outputPrice;
  return inputCost + outputCost;
}

function resolveEnvPrice(value: string | undefined) {
  if (value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolvePrice(
  providerPrice: number | null | undefined,
  fallbackPrice: number | null
) {
  if (providerPrice !== null && providerPrice !== undefined) {
    return providerPrice;
  }
  if (fallbackPrice !== null && fallbackPrice !== undefined) {
    return fallbackPrice;
  }
  return 0;
}

export async function billUsage(
  provider: Provider,
  modelSlug: string,
  usage: UpstreamUsage | null | undefined
) {
  if (!usage) {
    return null;
  }
  const inputTokens = usage.promptTokens;
  const outputTokens = usage.completionTokens;
  const defaultInputPrice = resolveEnvPrice(process.env.DEFAULT_INPUT_PRICE);
  const defaultOutputPrice = resolveEnvPrice(process.env.DEFAULT_OUTPUT_PRICE);
  const inputPrice = resolvePrice(provider.inputPrice, defaultInputPrice);
  const outputPrice = resolvePrice(provider.outputPrice, defaultOutputPrice);
  const cost = calculateCost(
    inputTokens,
    outputTokens,
    inputPrice,
    outputPrice
  );

  const db = getSqliteClient();
  const rows = await db
    .insert(usageLogs)
    .values({
      providerId: provider.id,
      modelSlug,
      inputTokens,
      outputTokens,
      cost,
    })
    .returning();
  return rows[0] ?? null;
}
