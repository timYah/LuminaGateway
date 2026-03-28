import type { UpstreamUsage } from "./upstreamService";
import type { Provider } from "../db/schema/providers";
import { persistUsageLog } from "./usageLogService";

export { calculateCost } from "./usageLogService";

type BillUsageMetadata = {
  routePath?: string | null;
  requestId?: string | null;
};

export async function billUsage(
  provider: Provider,
  modelSlug: string,
  usage: UpstreamUsage | null | undefined,
  metadata: BillUsageMetadata = {}
) {
  if (!usage) {
    return null;
  }
  return persistUsageLog({
    provider,
    modelSlug,
    usage: {
      inputTokens: usage.promptTokens,
      outputTokens: usage.completionTokens,
    },
    usageSource: "actual",
    routePath: metadata.routePath ?? null,
    requestId: metadata.requestId ?? null,
  });
}
