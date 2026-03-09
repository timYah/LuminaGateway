import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { providers } from "./providers";

export const requestLogs = sqliteTable(
  "request_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    providerId: integer("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),
    requestId: text("request_id"),
    modelSlug: text("model_slug").notNull(),
    result: text("result", { enum: ["success", "failure"] }).notNull(),
    errorType: text("error_type", {
      enum: [
        "quota",
        "rate_limit",
        "server",
        "auth",
        "model_not_found",
        "network",
        "unknown",
      ],
    }),
    latencyMs: integer("latency_ms"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    createdAtIdx: index("request_logs_created_at_idx").on(table.createdAt),
    requestIdIdx: index("request_logs_request_id_idx").on(table.requestId),
  })
);

export type RequestLog = typeof requestLogs.$inferSelect;
export type NewRequestLog = typeof requestLogs.$inferInsert;
