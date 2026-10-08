import { query, closePool } from '../../backend/src/database/pool.ts';
// Read-only diagnostics share the application's DATABASE_URL and TLS policy.
try {
  const start = Date.now();
  await query("SELECT current_database(), current_user, current_setting('TimeZone')");
  const result = await query(`SELECT
    (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE') AS tables,
    (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL) AS users,
    (SELECT COUNT(*) FROM products WHERE deleted_at IS NULL) AS products`);
  console.log(
    JSON.stringify({ connected: true, latencyMs: Date.now() - start, ...result.rows[0] }),
  );
} catch {
  console.error('Database diagnostics failed; check the application connection settings.');
  process.exitCode = 1;
} finally {
  await closePool();
}
