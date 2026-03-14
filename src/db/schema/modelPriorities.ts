import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { providers } from "./providers";

export const modelPriorities = sqliteTable(
  "model_priorities",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    providerId: integer("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),
    modelSlug: text("model_slug").notNull(),
    priority: integer("priority").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    providerModelUnique: uniqueIndex("model_priorities_provider_model_unique").on(
      table.providerId,
      table.modelSlug
    ),
    modelSlugIdx: index("model_priorities_model_slug_idx").on(table.modelSlug),
  })
);

export type ModelPriority = typeof modelPriorities.$inferSelect;
export type NewModelPriority = typeof modelPriorities.$inferInsert;
