import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { uploadBackupToCloud } from '../src/services/cloudBackupService.ts';
import { recalculateSupplierBalance } from '../src/services/supplierService.ts';
import { runAutoBackup } from '../src/services/autoBackupService.ts';
import { BACKUP_TABLES, createBackup, restoreBackup } from '../src/services/backupService.ts';
import { decrypt } from '../src/utils/crypto.ts';
import { query } from '../src/database/pool.ts';

describe('Reporting, Supplier Balance, and Backup Security Suite', () => {
  it('encrypts automatic backup data before uploading it', async () => {
    const snapshot = { data: { customers: [{ full_name: 'private-test-customer' }] } };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    try {
      await uploadBackupToCloud(snapshot, 'test.json', {
        provider: 'webhook',
        webhook_url: 'https://backup.example.invalid/upload',
      });
      const upload = fetchMock.mock.calls[0][1].body.get('file');
      const content = await upload.text();
      expect(content).not.toContain('private-test-customer');
      const envelope = JSON.parse(content);
      expect(envelope.encrypted).toBe(true);
      expect(JSON.parse(decrypt(envelope.payload))).toEqual(snapshot);
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('supplier balance recalculation query structure is correct', async () => {
    const dbQueries: any[] = [];
    const mockDb = async (text: string, params: any[]) => {
      dbQueries.push({ text, params });
      if (text.includes('UPDATE suppliers')) {
        return { rowCount: 1 };
      }
      return { rows: [] };
    };

    await recalculateSupplierBalance(mockDb as any, 888);
    expect(dbQueries.length).toBe(1);
    expect(dbQueries[0].text).toMatch(/UPDATE suppliers/);
    expect(dbQueries[0].text).toMatch(/purchase_invoices/);
    expect(dbQueries[0].text).toMatch(/payments/);
    expect(dbQueries[0].params).toEqual([888]);
  });

  it('dangerous backup operations keep confirmation and replication-role reset guards', async () => {
    const routesSource = await fs.readFile(
      new URL('../src/routes/admin.routes.ts', import.meta.url),
      'utf8',
    );
    const backupSource = await fs.readFile(
      path.join(process.cwd(), 'src', 'services', 'backupService.ts'),
      'utf8',
    );

    expect(routesSource).toMatch(/\/backup\/clear[\s\S]*requireConfirmation\('CONFIRM_CLEAR'\)/);
    for (const name of ['clearAllData', 'restoreBackup']) {
      const start = backupSource.indexOf(`export const ${name} =`);
      expect(start).not.toBe(-1);
      const nextExport = backupSource.indexOf('export const ', start + 1);
      const operation = backupSource.slice(start, nextExport === -1 ? undefined : nextExport);
      expect(operation).toMatch(
        /query\('BEGIN'\)[\s\S]*SET LOCAL session_replication_role = 'replica'/,
      );
      expect(operation).not.toMatch(/SET session_replication_role/);
      expect(operation).toMatch(/query\('COMMIT'\)/);
      expect(operation).toMatch(/catch[\s\S]*query\('ROLLBACK'\)/);
      expect(operation).toMatch(/finally\s*\{\s*client\.release\(\)/);
    }
  });

  it('sensitive read routes require explicit permissions', async () => {
    const productsSource = await fs.readFile(
      new URL('../src/routes/products.routes.ts', import.meta.url),
      'utf8',
    );
    const settingsSource = await fs.readFile(
      new URL('../src/routes/hr.routes.ts', import.meta.url),
      'utf8',
    );

    expect(productsSource).toMatch(
      /router\.get\('\/products\/:id',\s*authenticate,\s*authorize\('pos\.view'\),\s*api\.products\.get\)/,
    );
    expect(settingsSource).toMatch(
      /router\.get\('\/settings',\s*authenticate,\s*authorize\('settings\.view'\),\s*api\.users\.settings\)/,
    );
  });

  it('auto-backup runs successfully and creates file', async () => {
    const backupDir = path.join(process.cwd(), '..', 'tmp', 'test-auto-backups');
    process.env.AUTO_BACKUP_DIR = backupDir;
    process.env.AUTO_BACKUP_SKIP_CLEANUP = '1';
    process.env.AUTO_BACKUP_SKIP_EXTERNAL = '1';

    try {
      await fs.rm(backupDir, { recursive: true, force: true });
      await fs.mkdir(backupDir, { recursive: true });

      await runAutoBackup();

      const filesAfter = await fs.readdir(backupDir);
      const backupFiles = filesAfter.filter(
        (f) => f.startsWith('auto-backup-') && f.endsWith('.json'),
      );
      expect(backupFiles.length).toBe(1);
      const envelope = JSON.parse(await fs.readFile(path.join(backupDir, backupFiles[0]), 'utf8'));
      expect(envelope.encrypted).toBe(true);
      const snapshot = JSON.parse(decrypt(envelope.payload));
      expect(Object.keys(snapshot.data).sort()).toEqual([...BACKUP_TABLES].sort());
    } finally {
      await fs.rm(backupDir, { recursive: true, force: true });
      delete process.env.AUTO_BACKUP_DIR;
      delete process.env.AUTO_BACKUP_SKIP_CLEANUP;
      delete process.env.AUTO_BACKUP_SKIP_EXTERNAL;
    }
  });

  it('full encrypted database backup reads every current application table', async () => {
    const backup = await createBackup();
    try {
      const payload = JSON.parse(await fs.readFile(backup.path, 'utf8'));
      expect(payload.encrypted).toBe(true);
      expect(typeof payload.payload).toBe('string');
      const decoded = JSON.parse(decrypt(payload.payload));
      expect(Object.keys(decoded.data).sort()).toEqual([...BACKUP_TABLES].sort());
      const tables = await query(
        "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'schema_migrations'",
      );
      expect(tables.rows.map((row) => row.tablename).sort()).toEqual([...BACKUP_TABLES].sort());
    } finally {
      await fs.rm(backup.path, { force: true });
    }
  });

  it('rejects an incomplete backup before changing existing data', async () => {
    const fileName = `test-incomplete-${Date.now()}.json`;
    const filePath = path.join(process.cwd(), 'backups', fileName);
    const before = await query('SELECT id, code FROM accounts ORDER BY id');
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    try {
      await fs.writeFile(filePath, JSON.stringify({ data: { accounts: [] } }));
      await expect(restoreBackup(fileName)).rejects.toThrow('النسخة الاحتياطية ناقصة');
      const after = await query('SELECT id, code FROM accounts ORDER BY id');
      expect(after.rows).toEqual(before.rows);
    } finally {
      await fs.unlink(filePath);
    }
  });
});
