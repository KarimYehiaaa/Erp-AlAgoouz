import fs from 'fs/promises';
import path from 'path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { recordSupplierPayment, recalculateSupplierBalance } from '../src/services/supplierService.ts';
import { runAutoBackup } from '../src/services/autoBackupService.ts';
import pool from '../src/database/pool.js';

test.after(async () => {
  await pool.end();
});

test('supplier balance recalculation query structure is correct', async () => {
  const dbQueries = [];
  const mockDb = async (text, params) => {
    dbQueries.push({ text, params });
    if (text.includes('UPDATE suppliers')) {
      return { rowCount: 1 };
    }
    return { rows: [] };
  };

  await recalculateSupplierBalance(mockDb, 888);
  assert.equal(dbQueries.length, 1);
  assert.match(dbQueries[0].text, /UPDATE suppliers/);
  assert.match(dbQueries[0].text, /purchase_invoices/);
  assert.match(dbQueries[0].text, /payments/);
  assert.deepEqual(dbQueries[0].params, [888]);
});

test('dangerous backup operations keep confirmation and replication-role reset guards', async () => {
  const routesSource = await fs.readFile(path.join(process.cwd(), 'src', 'routes', 'index.js'), 'utf8');
  const backupSource = await fs.readFile(path.join(process.cwd(), 'src', 'services', 'backupService.ts'), 'utf8');

  assert.match(routesSource, /\/backup\/clear[\s\S]*requireConfirmation\('CONFIRM_CLEAR'\)/);
  assert.match(backupSource, /finally\s*\{[\s\S]*session_replication_role = 'origin'[\s\S]*client\.release\(\)/);
});

test('sensitive read routes require explicit permissions', async () => {
  const routesSource = await fs.readFile(path.join(process.cwd(), 'src', 'routes', 'index.js'), 'utf8');

  assert.match(routesSource, /router\.get\('\/products\/:id'[\s\S]*authorize\('products\.manage', 'sales\.branch'\)/);
  assert.match(routesSource, /router\.get\('\/settings'[\s\S]*authorize\('settings\.manage'\)/);
});

test('auto-backup runs successfully and creates file', async () => {
  const backupDir = path.join(process.cwd(), '..', 'tmp', 'test-auto-backups');
  process.env.AUTO_BACKUP_DIR = backupDir;
  process.env.AUTO_BACKUP_SKIP_CLEANUP = '1';
  process.env.AUTO_BACKUP_SKIP_EXTERNAL = '1';

  try {
    await fs.rm(backupDir, { recursive: true, force: true });
    await fs.mkdir(backupDir, { recursive: true });

    await runAutoBackup();

    const filesAfter = await fs.readdir(backupDir);
    const backupFiles = filesAfter.filter(f => f.startsWith('auto-backup-') && f.endsWith('.json'));
    assert.equal(backupFiles.length, 1, 'Auto-backup file should exist in the isolated test directory');
  } finally {
    await fs.rm(backupDir, { recursive: true, force: true });
    delete process.env.AUTO_BACKUP_DIR;
    delete process.env.AUTO_BACKUP_SKIP_CLEANUP;
    delete process.env.AUTO_BACKUP_SKIP_EXTERNAL;
  }
});
