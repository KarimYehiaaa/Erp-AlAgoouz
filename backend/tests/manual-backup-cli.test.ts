import { expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createDecipheriv, scryptSync } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertSafeTestDatabase } from '../scripts/testDatabaseSafety.ts';
import { readBackupSnapshot } from '../src/services/backupService.ts';

it('manual CLI exports readable encrypted business data and exits after closing its pools', async () => {
  assertSafeTestDatabase({ host: process.env.DB_HOST, database: process.env.DB_NAME });
  const backend = fileURLToPath(new URL('../', import.meta.url));
  const secret = 'Isolated-manual-backup-CLI-key-never-for-deployment';
  const before = await readBackupSnapshot();
  const result = spawnSync(process.execPath, ['scripts/run-backup-cli.ts'], {
    cwd: backend,
    encoding: 'utf8',
    timeout: 45000,
    windowsHide: true,
    env: { ...process.env, DATABASE_URL: '', BACKUP_ENCRYPTION_KEY: secret },
  });
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
  const results = result.stdout.split(/\r?\n/).filter((line) => line.startsWith('SUCCESS:'));
  expect(results).toHaveLength(1);
  const file = results[0].slice('SUCCESS:'.length);
  expect(file).toMatch(/^backup-[a-zA-Z0-9_-]+\.json$/);
  const target = path.join(backend, 'backups', file);
  try {
    const envelope = JSON.parse(await fs.readFile(target, 'utf8'));
    expect(envelope.encrypted).toBe(true);
    const [iv, tag, ciphertext] = envelope.payload.split(':');
    const decipher = createDecipheriv(
      'aes-256-gcm',
      scryptSync(secret, 'salt_al_ajouz_v2', 32),
      Buffer.from(iv, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(tag, 'hex'));
    const restored = JSON.parse(
      Buffer.concat([decipher.update(Buffer.from(ciphertext, 'hex')), decipher.final()]).toString(),
    );
    const normalized = (rows: unknown[]) => rows.map((row) => JSON.stringify(row)).sort();
    for (const [table, rows] of Object.entries(before)) {
      expect(normalized(restored.data[table]), table).toEqual(normalized(rows));
    }
  } finally {
    await fs.unlink(target);
  }
}, 60000);
