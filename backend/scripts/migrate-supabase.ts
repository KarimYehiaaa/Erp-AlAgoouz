/** Apply only pending migrations using the application's shared connection/TLS policy. */
import { runMigrations } from './migrate.ts';
import { closePool } from '../src/database/pool.ts';

const args = process.argv.slice(2);
if (args.some((argument) => argument !== '--allow-remote') || args.length > 1) {
  console.error('Usage: npm run migrate-supabase -w backend -- [--allow-remote]');
  process.exitCode = 2;
}

try {
  if (process.exitCode !== 2) await runMigrations({ allowRemote: args.includes('--allow-remote') });
} catch {
  console.error('Migration failed; inspect the migration log before retrying.');
  process.exitCode = 1;
} finally {
  await closePool();
}
