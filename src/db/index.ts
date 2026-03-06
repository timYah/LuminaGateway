import Database from "better-sqlite3";
import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type SqliteDatabase = ReturnType<typeof drizzleSqlite>;
export type PostgresDatabase = NodePgDatabase<typeof schema>;
export type DatabaseClient = SqliteDatabase | PostgresDatabase;

let db: DatabaseClient | null = null;
type SqliteInstance = InstanceType<typeof Database>;
let sqliteInstance: SqliteInstance | null = null;
let pgPool: Pool | null = null;

function normalizeDatabaseType(value: string | undefined) {
  if (!value) return "sqlite" as const;
  const normalized = value.toLowerCase();
  if (normalized === "sqlite" || normalized === "postgres") {
    return normalized;
  }
  throw new Error(`Unsupported DATABASE_TYPE: ${value}`);
}

function resolveSqliteFilename(url: string) {
  return url.startsWith("file:") ? url.slice("file:".length) : url;
}

export function getSqliteClient(): SqliteDatabase {
  return getDb() as SqliteDatabase;
}

export function getDb(): DatabaseClient {
  if (db) return db;

  const dbType = normalizeDatabaseType(process.env.DATABASE_TYPE);
  const dbUrl = process.env.DATABASE_URL ?? "file:./lumina.db";

  if (dbType === "postgres") {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required when DATABASE_TYPE=postgres");
    }
    pgPool = new Pool({ connectionString: dbUrl });
    db = drizzlePg(pgPool, { schema });
    return db;
  }

  sqliteInstance = new Database(resolveSqliteFilename(dbUrl));
  sqliteInstance.pragma("journal_mode = WAL");
  db = drizzleSqlite(sqliteInstance, { schema });
  return db;
}
