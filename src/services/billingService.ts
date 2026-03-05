import type { Model } from "../db/schema/models";
import { usageLogs } from "../db/schema/usageLogs";
import { getDb, type SqliteDatabase } from "../db";
import { deductBalance } from "./providerService";
import type { UpstreamUsage } from "./upstreamService";

function getClient() {
  return getDb() as SqliteDatabase;
}

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

export async function billUsage(
  providerId: number,
  modelSlug: string,
  usage: UpstreamUsage | null | undefined,
  model: Model
) {
  if (!usage) {
    return null;
  }
  const inputTokens = usage.promptTokens;
  const outputTokens = usage.completionTokens;
  const cost = calculateCost(
    inputTokens,
    outputTokens,
    model.inputPrice,
    model.outputPrice
  );

  if (cost > 0) {
    await deductBalance(providerId, cost);
  }
  const db = getClient();
  const rows = await db
    .insert(usageLogs)
    .values({
      providerId,
      modelSlug,
      inputTokens,
      outputTokens,
      cost,
    })
    .returning();
  return rows[0] ?? null;
}
