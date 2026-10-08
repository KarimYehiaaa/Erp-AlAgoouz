import { expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import config from '../src/config/index.ts';
import { assertSafeTestDatabase } from '../scripts/testDatabaseSafety.ts';
import { decrypt } from '../src/utils/crypto.ts';
import {
  BACKUP_TABLES,
  readBackupSnapshot,
  restoreBackupContent,
} from '../src/services/backupService.ts';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../');
type BackupData = Record<string, Record<string, unknown>[]>;

// The encrypted source remains local; only counts and irreversible hashes enter evidence.
// This destructive drill must never run in the ordinary suite or on a shared database.
it.skipIf(process.env.ERP_RESTORE_TEST !== '1' || process.env.ERP_SHARED_BACKUP_DRILL !== '1')(
  'restores the encrypted shared snapshot and preserves every original business field',
  async () => {
    assertSafeTestDatabase(config.db);
    const file = process.env.ERP_SHARED_BACKUP_FILE || '';
    const expectedHash = process.env.ERP_SHARED_BACKUP_SHA256 || '';
    expect(file).toMatch(/^backup-[a-zA-Z0-9T.-]+\.json$/);
    expect(expectedHash).toMatch(/^[a-fA-F0-9]{64}$/);
    expect((process.env.BACKUP_ENCRYPTION_KEY?.trim().length || 0) >= 32).toBe(true);
    const evidenceName =
      process.env.ERP_SHARED_BACKUP_EVIDENCE_FILE ||
      `shared-backup-restore-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}.json`;
    if (!/^[a-zA-Z0-9_.-]+\.json$/.test(evidenceName)) {
      throw new Error('ERP_SHARED_BACKUP_EVIDENCE_FILE must be a simple JSON filename.');
    }
    const bytes = await fs.readFile(path.resolve(repositoryRoot, 'backups', file));
    const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
    expect(hash(bytes)).toBe(expectedHash.toLowerCase());
    const envelope = JSON.parse(bytes.toString());
    expect(envelope.encrypted).toBe(true);
    const data = JSON.parse(decrypt(envelope.payload)).data as BackupData;
    expect(Object.keys(data).sort()).toEqual([...BACKUP_TABLES].sort());
    expect(await restoreBackupContent(bytes.toString())).toEqual({
      restored: BACKUP_TABLES.length,
    });
    const restored = (await readBackupSnapshot()) as BackupData;
    const canonical = (value: unknown): unknown => {
      if (value instanceof Date) return value.toISOString();
      if (Array.isArray(value)) return value.map(canonical);
      if (value !== null && typeof value === 'object') {
        const record = value as Record<string, unknown>;
        return Object.fromEntries(
          Object.keys(record)
            .sort()
            .map((key) => [key, canonical(record[key])]),
        );
      }
      return value;
    };
    const evidence: { table: string; rowCount: number; businessSha256: string }[] = [];
    for (const table of BACKUP_TABLES) {
      // Compare all fields actually present in the original schema. New migration
      // defaults may add columns; authorization is deliberately regenerated.
      const columns = Object.keys(data[table]![0] || {}).filter(
        (column) =>
          !(table === 'users' && column === 'session_generation') &&
          !(table === 'refresh_tokens' && column === 'revoked') &&
          !(table === 'manager_override_tokens' && column === 'used_at'),
      );
      const digestRows = (rows: Record<string, unknown>[]) =>
        hash(
          JSON.stringify(
            rows
              .map((row) =>
                JSON.stringify(
                  canonical(Object.fromEntries(columns.map((column) => [column, row[column]]))),
                ),
              )
              .sort(),
          ),
        );
      expect(restored[table]!.length, `${table}: row count`).toBe(data[table]!.length);
      const expected = digestRows(data[table]!);
      expect(digestRows(restored[table]!), `${table}: original business fields`).toBe(expected);
      evidence.push({ table, rowCount: data[table]!.length, businessSha256: expected });
    }
    expect(restored.users!.every((user) => typeof user.session_generation === 'string')).toBe(true);
    expect(restored.refresh_tokens!.every((token) => token.revoked === true)).toBe(true);
    expect(restored.manager_override_tokens!.every((token) => token.used_at !== null)).toBe(true);
    const completedAt = new Date().toISOString();
    await fs.writeFile(
      path.resolve(repositoryRoot, 'docs/audits/evidence', evidenceName),
      JSON.stringify(
        {
          sourceFile: file,
          sourceSha256: hash(bytes),
          completedAt,
          target: 'disposable local PostgreSQL test database',
          tableCount: BACKUP_TABLES.length,
          businessRecordsVerified: true,
          historicalAuthorizationRevoked: true,
          tables: evidence,
        },
        null,
        2,
      ),
      { flag: 'wx' },
    );
  },
  180000,
);
