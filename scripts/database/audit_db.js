import fs from 'node:fs/promises';
import { getClient, closePool } from '../../backend/src/database/pool.ts';
import { BACKUP_TABLES } from '../../backend/src/services/backupService.ts';

// This check compares counts only; the restore round-trip test checks complete records.
let client;
try {
  if (!process.argv[2]) throw new Error('Pass the backup JSON file to compare.');
  const backup = JSON.parse(await fs.readFile(process.argv[2], 'utf8'));
  const data = backup.data;
  if (!data || typeof data !== 'object' || Array.isArray(data))
    throw new Error('Invalid backup data.');
  const allowed = new Set(BACKUP_TABLES);
  for (const [table, rows] of Object.entries(data)) {
    if (!allowed.has(table) || !Array.isArray(rows))
      throw new Error('Unknown backup table or invalid rows.');
  }
  client = await getClient();
  await client.query('BEGIN READ ONLY');
  let mismatches = 0;
  for (const [table, rows] of Object.entries(data)) {
    // Identifiers come exclusively from the application's fixed backup table allowlist.
    const count = Number(
      (await client.query(`SELECT COUNT(*) AS count FROM "${table}"`)).rows[0].count,
    );
    if (count !== rows.length) mismatches++;
    console.log(
      JSON.stringify({
        table,
        backupCount: rows.length,
        databaseCount: count,
        matchingCount: count === rows.length,
      }),
    );
  }
  await client.query('COMMIT');
  if (mismatches) process.exitCode = 1;
} catch (err) {
  if (client) await client.query('ROLLBACK').catch(() => {});
  console.error(
    'Backup count comparison failed:',
    err instanceof Error ? err.message : 'Unknown error',
  );
  process.exitCode = 1;
} finally {
  client?.release();
  await closePool();
}
