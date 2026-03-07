import { getSqliteClient } from "../db";
import { requestLogs } from "../db/schema/requestLogs";
import type { FailureReason } from "./failureStatsService";

export type RequestLogResult = "success" | "failure";

export type CreateRequestLogInput = {
  providerId: number;
  modelSlug: string;
  result: RequestLogResult;
  latencyMs?: number | null;
  errorType?: FailureReason | null;
};

export async function createRequestLog(input: CreateRequestLogInput) {
  const db = getSqliteClient();
  const rows = await db
    .insert(requestLogs)
    .values({
      providerId: input.providerId,
      modelSlug: input.modelSlug,
      result: input.result,
      latencyMs: input.latencyMs ?? null,
      errorType: input.errorType ?? null,
    })
    .returning();
  return rows[0] ?? null;
}
