import { isLoopbackDatabaseConnection } from './connectionOptions.ts';

/** Refuse unattended schema changes to a shared/hosted database. */
export const assertMigrationsAllowed = (
  endpoint: { connectionString?: string | null; host?: string | null; port?: number | null },
  pendingMigrations: readonly string[],
  explicitlyApproved: boolean,
  configuredLocalDatabaseHost?: string,
  requiresTrackingWrites = false,
): void => {
  const usesConfiguredLocalHost =
    !endpoint.connectionString &&
    Boolean(configuredLocalDatabaseHost) &&
    endpoint.host?.toLowerCase() === configuredLocalDatabaseHost?.toLowerCase();

  if (
    (pendingMigrations.length > 0 || requiresTrackingWrites) &&
    !usesConfiguredLocalHost &&
    !isLoopbackDatabaseConnection({
      connectionString: endpoint.connectionString ?? undefined,
      host: endpoint.host,
    }) &&
    !explicitlyApproved
  ) {
    throw new Error(
      `Database migration changes (${pendingMigrations.length} pending migrations${requiresTrackingWrites ? ', migration tracking updates' : ''}) target a remote database. Stop both API versions, verify a fresh restorable backup, then run \`npm run migrate-supabase -w backend -- --allow-remote\` during the coordinated maintenance window.`,
    );
  }
};
