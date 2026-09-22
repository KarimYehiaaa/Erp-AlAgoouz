// Pure validation: safe to import before configuration, pool creation or setup.
export function assertSafeTestDatabase(target: {
  host?: string | null;
  database?: string | null;
  connectionString?: string | null;
}): void {
  const reject = () => {
    throw new Error('Unsafe test database target: use a loopback host and a database ending in _test.');
  };
  let host = target.host || '';
  let database = target.database || '';
  if (target.connectionString) {
    try {
      const url = new URL(target.connectionString);
      // Query parameters can override host/database in pg-connection-string.
      if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.search || url.hash) reject();
      host = url.hostname;
      database = decodeURIComponent(url.pathname.slice(1));
    } catch {
      reject();
    }
  }
  const localHosts = ['localhost', '127.0.0.1', '::1', '[::1]', '::ffff:127.0.0.1'];
  if (!localHosts.includes(host.toLowerCase()) || !/^[a-zA-Z0-9_]+_test$/.test(database)) reject();
}
