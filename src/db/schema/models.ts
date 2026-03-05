import { integer, real, sqliteTable, text, index } from "drizzle-orm/sqlite-core";
import { providers } from "./providers";

export const models = sqliteTable(
  "models",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    providerId: integer("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    upstreamName: text("upstream_name").notNull(),
    inputPrice: real("input_price").notNull().default(0),
    outputPrice: real("output_price").notNull().default(0),
  },
  (table) => ({
    slugIdx: index("models_slug_idx").on(table.slug),
  })
);

export type Model = typeof models.$inferSelect;
export type NewModel = typeof models.$inferInsert;
