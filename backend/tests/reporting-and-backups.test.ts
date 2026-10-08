import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { uploadBackupToCloud } from '../src/services/cloudBackupService.ts';
import { recalculateSupplierBalance } from '../src/services/supplierService.ts';
import { initAutoBackupScheduler, runAutoBackup } from '../src/services/autoBackupService.ts';
import { BACKUP_TABLES, createBackup, restoreBackup } from '../src/services/backupService.ts';
import { decrypt } from '../src/utils/crypto.ts';
import { query } from '../src/database/pool.ts';

describe('Reporting, Supplier Balance, and Backup Security Suite', () => {
  it('does not schedule backup writes or retention cleanup in test mode', () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');

    try {
      initAutoBackupScheduler();
      expect(setTimeoutSpy).not.toHaveBeenCalled();
      expect(setIntervalSpy).not.toHaveBeenCalled();
    } finally {
      setTimeoutSpy.mockRestore();
      setIntervalSpy.mockRestore();
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it('encrypts automatic backup data before uploading it', async () => {
    const snapshot = { data: { customers: [{ full_name: 'private-test-customer' }] } };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    try {
      await uploadBackupToCloud(snapshot, 'test.json', {
        provider: 'webhook',
        webhook_url: 'https://8.8.8.8/upload',
      });
      const requestOptions = fetchMock.mock.calls[0][1];
      expect(requestOptions.redirect).toBe('error');
      expect(requestOptions.dispatcher).toBeDefined();
      const upload = requestOptions.body.get('file');
      const content = await upload.text();
      expect(content).not.toContain('private-test-customer');
      const envelope = JSON.parse(content);
      expect(envelope.encrypted).toBe(true);
      expect(JSON.parse(decrypt(envelope.payload))).toEqual(snapshot);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('rejects internal webhook destinations before sending backup data', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    try {
      await expect(
        uploadBackupToCloud(
          { data: { customers: [{ full_name: 'private-test-customer' }] } },
          'test.json',
          {
            provider: 'webhook',
            webhook_url: 'https://127.0.0.1/latest/meta-data',
          },
        ),
      ).rejects.toMatchObject({ statusCode: 403 });
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('supplier balance recalculation query structure is correct', async () => {
    const dbQueries: { text: string; params: unknown[] }[] = [];
    const mockDb = async (text: string, params: unknown[]) => {
      dbQueries.push({ text, params });
      if (text.includes('UPDATE suppliers')) {
        return { rowCount: 1 };
      }
      return { rows: [] };
    };

    await recalculateSupplierBalance(
      mockDb as unknown as Parameters<typeof recalculateSupplierBalance>[0],
      888,
    );
    expect(dbQueries.length).toBe(1);
    expect(dbQueries[0].text).toMatch(/UPDATE suppliers/);
    expect(dbQueries[0].text).toMatch(/purchase_invoices/);
    expect(dbQueries[0].text).toMatch(/payments/);
    expect(dbQueries[0].params).toEqual([888]);
  });

  it('dangerous backup operations keep confirmation and transactional guards', async () => {
    const routesSource = await fs.readFile(
      new URL('../src/routes/admin.routes.ts', import.meta.url),
      'utf8',
    );
    const backupSource = await fs.readFile(
      path.join(process.cwd(), 'src', 'services', 'backupService.ts'),
      'utf8',
    );

    expect(routesSource).toMatch(/\/backup\/clear[\s\S]*requireConfirmation\('CONFIRM_CLEAR'\)/);
    for (const name of ['clearAllData', 'restoreBackupContent']) {
      const start = backupSource.indexOf(`export const ${name} =`);
      expect(start).not.toBe(-1);
      const nextExport = backupSource.indexOf('export const ', start + 1);
      const operation = backupSource.slice(start, nextExport === -1 ? undefined : nextExport);
      expect(operation).toMatch(/query\('BEGIN'\)/);
      expect(operation).not.toMatch(/SET session_replication_role/);
      expect(operation).toMatch(/query\('COMMIT'\)/);
      expect(operation).toMatch(/catch[\s\S]*query\('ROLLBACK'\)/);
      expect(operation).toMatch(/finally\s*\{\s*client\.release\(\)/);
      if (name === 'clearAllData') {
        expect(operation).toMatch(/RESTART IDENTITY RESTRICT/);
        expect(operation).not.toMatch(/CASCADE/);
      } else {
        expect(operation).toMatch(/SET LOCAL session_replication_role = 'replica'/);
      }
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
    const inventorySource = await fs.readFile(
      new URL('../src/routes/inventory.routes.ts', import.meta.url),
      'utf8',
    );

    expect(productsSource).toMatch(
      /router\.get\('\/products\/:id',\s*authenticate,\s*authorize\('pos\.view'\),\s*api\.products\.get\)/,
    );
    expect(settingsSource).toMatch(
      /router\.get\('\/settings',\s*authenticate,\s*authorize\('settings\.view'\),\s*api\.users\.settings\)/,
    );
    expect(inventorySource).toMatch(
      /router\.get\(\s*'\/warehouses',\s*authenticate,\s*authorize\('inventory\.view',\s*'pos\.view'\),\s*api\.inventory\.warehouses,?\s*\)/,
    );
  });

  it('auto-backup runs successfully and creates file', async () => {
    const backupDir = await fs.mkdtemp(path.join(os.tmpdir(), 'alagoouz-test-auto-backups-'));
    const previousBackupDir = process.env.AUTO_BACKUP_DIR;
    const previousSkipCleanup = process.env.AUTO_BACKUP_SKIP_CLEANUP;
    const previousSkipExternal = process.env.AUTO_BACKUP_SKIP_EXTERNAL;
    process.env.AUTO_BACKUP_DIR = backupDir;
    process.env.AUTO_BACKUP_SKIP_CLEANUP = '1';
    process.env.AUTO_BACKUP_SKIP_EXTERNAL = '1';
    let cleanupError: Error | undefined;

    try {
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
      try {
        const resolvedBackupDir = path.resolve(backupDir);
        if (
          path.dirname(resolvedBackupDir) !== path.resolve(os.tmpdir()) ||
          !path.basename(resolvedBackupDir).startsWith('alagoouz-test-auto-backups-')
        ) {
          cleanupError = new Error('Refusing to remove an unexpected auto-backup test directory.');
        } else {
          try {
            await fs.rm(resolvedBackupDir, { recursive: true, force: true });
          } catch (error) {
            cleanupError = error instanceof Error ? error : new Error(String(error));
          }
        }
      } finally {
        if (previousBackupDir === undefined) delete process.env.AUTO_BACKUP_DIR;
        else process.env.AUTO_BACKUP_DIR = previousBackupDir;
        if (previousSkipCleanup === undefined) delete process.env.AUTO_BACKUP_SKIP_CLEANUP;
        else process.env.AUTO_BACKUP_SKIP_CLEANUP = previousSkipCleanup;
        if (previousSkipExternal === undefined) delete process.env.AUTO_BACKUP_SKIP_EXTERNAL;
        else process.env.AUTO_BACKUP_SKIP_EXTERNAL = previousSkipExternal;
      }
    }
    if (cleanupError) throw cleanupError;
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
