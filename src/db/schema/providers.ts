import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const PROVIDER_HEALTH_STATUSES = [
  "healthy",
  "unhealthy",
  "unknown",
] as const;
export type ProviderHealthStatus = (typeof PROVIDER_HEALTH_STATUSES)[number];

export const providers = sqliteTable("providers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  protocol: text("protocol", { enum: ["openai", "anthropic", "google", "new-api"] }).notNull(),
  baseUrl: text("base_url").notNull(),
  apiKey: text("api_key").notNull(),
  apiMode: text("api_mode", { enum: ["responses", "chat"] })
    .notNull()
    .default("responses"),
  balance: real("balance").notNull().default(0),
  inputPrice: real("input_price"),
  outputPrice: real("output_price"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  priority: integer("priority").notNull().default(0),
  healthStatus: text("health_status", { enum: PROVIDER_HEALTH_STATUSES })
    .notNull()
    .default("unknown"),
  lastHealthCheckAt: integer("last_health_check_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export type Provider = typeof providers.$inferSelect;
export type NewProvider = typeof providers.$inferInsert;
