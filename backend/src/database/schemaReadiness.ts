import fs from 'node:fs';

export type SchemaReadinessQuery = (
  sql: string,
) => Promise<{ rows: Array<Record<string, unknown>> }>;

export type SchemaReadiness =
  | { ready: true; pendingCount: 0 }
  | { ready: false; pendingCount: number; reason: 'tracking-table-missing' | 'pending-migrations' };

export const loadMigrationFiles = (migrationsDirectory: string): string[] =>
  fs
    .readdirSync(migrationsDirectory)
    .filter((file) => file.endsWith('.sql'))
    .sort((a, b) => {
      const versionDifference = Number.parseInt(a, 10) - Number.parseInt(b, 10);
      return versionDifference || a.localeCompare(b);
    });

/** Fail closed when the database cannot prove it matches the backend migration set. */
export const evaluateSchemaReadiness = (
  migrationFiles: readonly string[],
  trackingTableExists: boolean,
  appliedVersions: readonly string[],
): SchemaReadiness => {
  if (!trackingTableExists) {
    return { ready: false, pendingCount: migrationFiles.length, reason: 'tracking-table-missing' };
  }

  const applied = new Set(appliedVersions);
  const pendingCount = migrationFiles.filter((file) => !applied.has(file)).length;
  return pendingCount === 0
    ? { ready: true, pendingCount: 0 }
    : { ready: false, pendingCount, reason: 'pending-migrations' };
};

/** Check schema state without creating migration tables or changing business data. */
export const readDatabaseSchemaReadiness = async (
  query: SchemaReadinessQuery,
  migrationFiles: readonly string[],
): Promise<SchemaReadiness> => {
  const tableResult = await query(`SELECT EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'schema_migrations'
  ) AS exists`);
  const trackingTableExists = tableResult.rows[0]?.exists === true;
  const appliedResult = trackingTableExists
    ? await query('SELECT version FROM public.schema_migrations')
    : { rows: [] as Array<Record<string, unknown>> };
  const appliedVersions = appliedResult.rows.map((row) => String(row.version ?? ''));
  return evaluateSchemaReadiness(migrationFiles, trackingTableExists, appliedVersions);
};

export const assertDatabaseSchemaReady = async (
  query: SchemaReadinessQuery,
  migrationFiles: readonly string[],
): Promise<void> => {
  const readiness = await readDatabaseSchemaReadiness(query, migrationFiles);
  if (readiness.ready === false) {
    throw new Error(
      `Database schema is not ready (${readiness.reason}; ${readiness.pendingCount} migration(s) pending).`,
    );
  }
};
