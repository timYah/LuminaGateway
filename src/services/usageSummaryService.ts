type UsageAggregate = {
  requests: number;
  tokens: number;
  costUsd: number;
};

type UsageRecord = {
  apiKey: string;
  route: string;
  totalTokens: number;
  estimatedCostUsd: number;
};

const totals: UsageAggregate = { requests: 0, tokens: 0, costUsd: 0 };
const byKey = new Map<string, UsageAggregate>();
const byRoute = new Map<string, UsageAggregate>();
const byKeyRoute = new Map<string, Map<string, UsageAggregate>>();
let startedAt = Date.now();

function ensureAggregate(map: Map<string, UsageAggregate>, key: string) {
  const existing = map.get(key);
  if (existing) return existing;
  const created = { requests: 0, tokens: 0, costUsd: 0 };
  map.set(key, created);
  return created;
}

function applyUsage(target: UsageAggregate, usage: UsageRecord) {
  target.requests += 1;
  target.tokens += usage.totalTokens;
  target.costUsd += usage.estimatedCostUsd;
}

function mapToObject(map: Map<string, UsageAggregate>) {
  return Object.fromEntries(
    Array.from(map.entries()).map(([key, value]) => [key, { ...value }])
  );
}

export function recordUsage(input: {
  apiKey: string;
  route: string;
  totalTokens: number;
  estimatedCostUsd: number;
}) {
  if (!input.apiKey || !input.route) return;
  const usage: UsageRecord = {
    apiKey: input.apiKey,
    route: input.route,
    totalTokens: Math.max(0, input.totalTokens),
    estimatedCostUsd: Math.max(0, input.estimatedCostUsd),
  };

  applyUsage(totals, usage);

  applyUsage(ensureAggregate(byKey, usage.apiKey), usage);
  applyUsage(ensureAggregate(byRoute, usage.route), usage);

  const routeMap = byKeyRoute.get(usage.apiKey) ?? new Map<string, UsageAggregate>();
  applyUsage(ensureAggregate(routeMap, usage.route), usage);
  byKeyRoute.set(usage.apiKey, routeMap);
}

export function getUsageSummary() {
  const byKeyRouteObj: Record<string, Record<string, UsageAggregate>> = {};
  for (const [key, routeMap] of byKeyRoute.entries()) {
    byKeyRouteObj[key] = mapToObject(routeMap);
  }

  return {
    since: new Date(startedAt).toISOString(),
    totals: { ...totals },
    byKey: mapToObject(byKey),
    byRoute: mapToObject(byRoute),
    byKeyRoute: byKeyRouteObj,
  };
}

export function resetUsageSummary() {
  totals.requests = 0;
  totals.tokens = 0;
  totals.costUsd = 0;
  byKey.clear();
  byRoute.clear();
  byKeyRoute.clear();
  startedAt = Date.now();
}
