import { getSqliteClient } from "../db";
import { usageLogs, type UsageSource } from "../db/schema/usageLogs";
import type { Provider } from "../db/schema/providers";

type UsageLogValue = {
  inputTokens: number;
  outputTokens: number;
};

export type PersistUsageLogInput = {
  provider: Provider;
  modelSlug: string;
  usage: UsageLogValue;
  usageSource?: UsageSource;
  routePath?: string | null;
  requestId?: string | null;
  costUsd?: number | null;
};

export type PersistEstimatedUsageLogInput = {
  provider: Provider;
  modelSlug: string;
  inputTokens: number;
  outputTokens: number;
  routePath?: string | null;
  requestId?: string | null;
  costUsd?: number | null;
};

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

export function resolveUsageCost(provider: Provider, usage: UsageLogValue) {
  const defaultInputPrice = resolveEnvPrice(process.env.DEFAULT_INPUT_PRICE);
  const defaultOutputPrice = resolveEnvPrice(process.env.DEFAULT_OUTPUT_PRICE);
  const inputPrice = resolvePrice(provider.inputPrice, defaultInputPrice);
  const outputPrice = resolvePrice(provider.outputPrice, defaultOutputPrice);
  return calculateCost(usage.inputTokens, usage.outputTokens, inputPrice, outputPrice);
}

export async function persistUsageLog(input: PersistUsageLogInput) {
  const inputTokens = Math.max(0, Math.trunc(input.usage.inputTokens));
  const outputTokens = Math.max(0, Math.trunc(input.usage.outputTokens));
  const cost =
    input.costUsd !== null && input.costUsd !== undefined
      ? Math.max(0, input.costUsd)
      : resolveUsageCost(input.provider, {
          inputTokens,
          outputTokens,
        });

  const db = getSqliteClient();
  const rows = await db
    .insert(usageLogs)
    .values({
      providerId: input.provider.id,
      modelSlug: input.modelSlug,
      usageSource: input.usageSource ?? "actual",
      routePath: input.routePath ?? null,
      requestId: input.requestId ?? null,
      inputTokens,
      outputTokens,
      cost,
    })
    .returning();
  return rows[0] ?? null;
}

export async function persistEstimatedUsageLog(input: PersistEstimatedUsageLogInput) {
  return persistUsageLog({
    provider: input.provider,
    modelSlug: input.modelSlug,
    usage: {
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
    },
    usageSource: "estimated",
    routePath: input.routePath ?? null,
    requestId: input.requestId ?? null,
    costUsd: input.costUsd ?? null,
  });
}
