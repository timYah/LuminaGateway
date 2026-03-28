import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { providers } from "./providers";

export const usageLogs = sqliteTable(
  "usage_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    providerId: integer("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),
    modelSlug: text("model_slug").notNull(),
    usageSource: text("usage_source", { enum: ["actual", "estimated"] })
      .notNull()
      .default("actual"),
    routePath: text("route_path"),
    requestId: text("request_id"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    cost: real("cost").notNull().default(0),
    statusCode: integer("status_code"),
    latencyMs: integer("latency_ms"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    createdAtIdx: index("usage_logs_created_at_idx").on(table.createdAt),
    requestIdIdx: index("usage_logs_request_id_idx").on(table.requestId),
  })
);

export type UsageLog = typeof usageLogs.$inferSelect;
export type NewUsageLog = typeof usageLogs.$inferInsert;
export type UsageSource = NonNullable<UsageLog["usageSource"]>;
