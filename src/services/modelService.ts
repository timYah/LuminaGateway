import { asc, desc, eq, inArray } from "drizzle-orm";
import { getSqliteClient } from "../db";
import { modelPriorities, providers, type ModelPriority, type Provider } from "../db/schema";

export type ActiveProvider = Provider & { modelPriority?: number | null };

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isWildcardPattern(pattern: string) {
  return pattern.includes("*");
}

function matchesModelPattern(pattern: string, modelSlug: string) {
  if (!isWildcardPattern(pattern)) {
    return pattern === modelSlug;
  }
  if (pattern === "*") return true;
  const regexSource = `^${escapeRegex(pattern).replace(/\\\*/g, ".*")}$`;
  return new RegExp(regexSource).test(modelSlug);
}

function patternSpecificity(pattern: string) {
  return pattern.replace(/\*/g, "").length;
}

function pickBestModelPriority(
  rows: ModelPriority[] | undefined,
  modelSlug: string
): number | null {
  if (!rows || rows.length === 0) return null;
  let best: ModelPriority | null = null;
  let bestExact = false;
  let bestSpecificity = -1;
  let bestPriority = -Infinity;
  let bestId = Infinity;

  for (const row of rows) {
    if (!matchesModelPattern(row.modelSlug, modelSlug)) continue;
    const exact = !isWildcardPattern(row.modelSlug);
    const specificity = patternSpecificity(row.modelSlug);

    if (!best) {
      best = row;
      bestExact = exact;
      bestSpecificity = specificity;
      bestPriority = row.priority;
      bestId = row.id;
      continue;
    }

    if (exact !== bestExact) {
      if (exact) {
        best = row;
        bestExact = exact;
        bestSpecificity = specificity;
        bestPriority = row.priority;
        bestId = row.id;
      }
      continue;
    }

    if (specificity !== bestSpecificity) {
      if (specificity > bestSpecificity) {
        best = row;
        bestSpecificity = specificity;
        bestPriority = row.priority;
        bestId = row.id;
      }
      continue;
    }

    if (row.priority !== bestPriority) {
      if (row.priority > bestPriority) {
        best = row;
        bestPriority = row.priority;
        bestId = row.id;
      }
      continue;
    }

    if (row.id < bestId) {
      best = row;
      bestId = row.id;
    }
  }

  return best?.priority ?? null;
}

export async function getActiveProvidersByModel(modelSlug: string): Promise<ActiveProvider[]> {
  const db = getSqliteClient();
  const providerRows = await db
    .select()
    .from(providers)
    .where(eq(providers.isActive, true))
    .orderBy(desc(providers.priority), asc(providers.id));

  if (providerRows.length === 0) return [];

  const providerIds = providerRows.map((provider) => provider.id);
  const priorityRows = await db
    .select()
    .from(modelPriorities)
    .where(inArray(modelPriorities.providerId, providerIds));

  const prioritiesByProvider = new Map<number, ModelPriority[]>();
  for (const row of priorityRows) {
    const list = prioritiesByProvider.get(row.providerId);
    if (list) {
      list.push(row);
    } else {
      prioritiesByProvider.set(row.providerId, [row]);
    }
  }

  return providerRows.map((provider) => ({
    ...provider,
    modelPriority: pickBestModelPriority(prioritiesByProvider.get(provider.id), modelSlug),
  }));
}
