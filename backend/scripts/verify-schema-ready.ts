import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { closePool, query } from '../src/database/pool.ts';
import { assertDatabaseSchemaReady, loadMigrationFiles } from '../src/database/schemaReadiness.ts';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsDirectory = path.join(scriptDirectory, '../migrations');

const migrationFiles = loadMigrationFiles(migrationsDirectory);

let exitCode = 0;
try {
  await assertDatabaseSchemaReady(query, migrationFiles);
  console.log('Schema readiness check passed.');
} catch {
  // Do not print connection details, endpoint names, or credentials.
  console.error('Schema readiness check failed; existing startup configuration was not changed.');
  exitCode = 1;
} finally {
  try {
    await closePool();
  } catch {
    exitCode = 1;
  }
}

process.exitCode = exitCode;
