import config from '../config/index.ts';

/** One resolved endpoint and TLS policy for business and maintenance connections. */
export const databaseConnectionOptions = () => ({
  ...(config.db.connectionString
    ? { connectionString: config.db.connectionString }
    : {
        host: config.db.host ?? undefined,
        port: config.db.port ?? undefined,
        database: config.db.database ?? undefined,
        user: config.db.user ?? undefined,
        password: config.db.password ?? undefined,
      }),
  ssl: config.db.ssl,
});

/** Connection budgets follow the database endpoint, including a local API using Supabase. */
export const isLoopbackDatabaseConnection = (
  options: { connectionString?: string; host?: string | null } = databaseConnectionOptions(),
) => {
  const hostname = options.connectionString
    ? new URL(options.connectionString).hostname
    : options.host || 'localhost';
  return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(hostname.toLowerCase());
};
