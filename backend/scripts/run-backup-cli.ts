/** Encrypted manual backup; emits SUCCESS:<file> only after closing database pools. */
import { createBackup } from '../src/services/backupService.ts';
import { closePool } from '../src/database/pool.ts';

let file: string | undefined;
try {
  if ((process.env.BACKUP_ENCRYPTION_KEY?.trim().length || 0) < 32) {
    throw new Error(
      'BACKUP_ENCRYPTION_KEY must contain at least 32 characters for a portable backup.',
    );
  }
  file = (await createBackup()).file;
} catch (error: unknown) {
  console.error('FAILED:', error instanceof Error ? error.message : 'Backup failed');
  process.exitCode = 1;
} finally {
  try {
    await closePool();
  } catch {
    console.error('FAILED: Could not close database connections after backup.');
    process.exitCode = 1;
  }
}
if (!process.exitCode && file) console.log('SUCCESS:' + file);
