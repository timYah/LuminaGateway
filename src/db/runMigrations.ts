import { migrate as migrateSqlite } from "drizzle-orm/better-sqlite3/migrator";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { getDb, type PostgresDatabase, type SqliteDatabase } from "./index";

function normalizeDatabaseType(value: string | undefined) {
  if (!value) return "sqlite" as const;
  const normalized = value.toLowerCase();
  if (normalized === "sqlite" || normalized === "postgres") {
    return normalized;
  }
  throw new Error(`Unsupported DATABASE_TYPE: ${value}`);
}

export async function runMigrations() {
  const dbType = normalizeDatabaseType(process.env.DATABASE_TYPE);
  const db = getDb();

  if (dbType === "postgres") {
    await migratePg(db as PostgresDatabase, { migrationsFolder: "drizzle" });
    return;
  }

  migrateSqlite(db as SqliteDatabase, { migrationsFolder: "drizzle" });
}
