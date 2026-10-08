import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { query } from './pool.ts';
import { loadMigrationFiles, readDatabaseSchemaReadiness } from './schemaReadiness.ts';

const migrationsDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../migrations',
);
const readinessCacheMs = 10_000;

let cachedReadiness:
  { expiresAt: number; result: ReturnType<typeof readDatabaseSchemaReadiness> } | undefined;

/** Reuse the schema check briefly within a warm serverless instance. */
export const getServerlessSchemaReadiness = () => {
  if (cachedReadiness && cachedReadiness.expiresAt > Date.now()) {
    return cachedReadiness.result;
  }

  const result = readDatabaseSchemaReadiness(query, loadMigrationFiles(migrationsDirectory));
  cachedReadiness = { expiresAt: Date.now() + readinessCacheMs, result };
  void result.catch(() => {
    if (cachedReadiness?.result === result) cachedReadiness = undefined;
  });
  return result;
};
