import { mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const TEST_DB_ROOT = resolve(process.cwd(), ".runtime/test-db");
const SQLITE_ARTIFACT_SUFFIXES = ["", "-shm", "-wal"] as const;

function resolveTestDatabaseFilename(name: string) {
  return resolve(TEST_DB_ROOT, `${name}.db`);
}

export function configureTestDatabase(name: string) {
  mkdirSync(TEST_DB_ROOT, { recursive: true });

  const filename = resolveTestDatabaseFilename(name);
  for (const suffix of SQLITE_ARTIFACT_SUFFIXES) {
    rmSync(`${filename}${suffix}`, { force: true });
  }

  process.env.DATABASE_TYPE = "sqlite";
  process.env.DATABASE_URL = `file:${filename}`;
}
