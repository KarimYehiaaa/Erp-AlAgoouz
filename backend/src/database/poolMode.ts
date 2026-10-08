export type DatabasePoolMode = 'session' | 'transaction';

/** Preserve the configured endpoint; pooler ports select different connection semantics. */
export const resolvePoolMode = (
  requestedMode: string,
  connection: { connectionString?: string | null; host?: string | null; port?: number | null },
): DatabasePoolMode => {
  if (!['auto', 'session', 'transaction'].includes(requestedMode)) {
    throw new Error('[Config] DB_POOL_MODE must be auto, session, or transaction.');
  }
  let host = connection.host || '';
  let port = connection.port || 5432;
  if (connection.connectionString) {
    let url: URL;
    try {
      url = new URL(connection.connectionString);
    } catch {
      throw new Error('[Config] DATABASE_URL must be a complete PostgreSQL connection URI.');
    }
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname) {
      throw new Error('[Config] DATABASE_URL must be a complete PostgreSQL connection URI.');
    }
    host = url.hostname;
    port = Number(url.port || 5432);
  }
  if (requestedMode === 'session' || requestedMode === 'transaction') return requestedMode;
  const isSupabase = /(?:^|\.)supabase\.(?:com|co)$/i.test(host);
  return isSupabase && port === 6543 ? 'transaction' : 'session';
};
