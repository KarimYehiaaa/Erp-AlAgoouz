import { expect, it } from 'vitest';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { query } from '../src/database/pool.ts';
import {
  BACKUP_TABLES,
  createBackup,
  readBackupSnapshot,
  restoreBackup,
} from '../src/services/backupService.ts';

// Run explicitly on the disposable recovery database; never truncate the shared suite database.
it.skipIf(process.env.DB_NAME !== 'bin_al_ajouz_restore_test')(
  'restores every table without changing records',
  async () => {
    // Arrays stored in JSONB must not be sent back as PostgreSQL array literals.
    await query(
      `UPDATE workflows_nodes SET settings = '[{"label":"اختبار"},1,true]'::jsonb WHERE id = (SELECT MIN(id) FROM workflows_nodes)`,
    );
    const marker = randomUUID();
    // Historical movements stay in their original warehouse after routing changes.
    const warehouses = await query('SELECT id FROM warehouses ORDER BY id LIMIT 2');
    expect(warehouses.rows).toHaveLength(2);
    const product = await query(
      `INSERT INTO products (sku, name_ar, purchase_price, sale_price, primary_warehouse_id)
       VALUES ($1, $2, 10, 15, $3) RETURNING id`,
      [`restore-${marker}`, `اختبار حفظ حركة تاريخية ${marker}`, warehouses.rows[0].id],
    );
    await query(
      `INSERT INTO stock_movements (product_id, to_warehouse_id, movement_type, quantity)
       VALUES ($1, $2, 'production', 0.25)`,
      [product.rows[0].id, warehouses.rows[0].id],
    );
    await query('UPDATE products SET primary_warehouse_id = $1 WHERE id = $2', [
      warehouses.rows[1].id, product.rows[0].id,
    ]);
    const documentCounter = Date.now();
    const entry = await query(
      `INSERT INTO journal_entries (entry_number, description, status)
    VALUES ($1, 'اختبار استرجاع', 'draft') RETURNING id`,
      [`JE-${documentCounter}`],
    );
    await query(
      `INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit)
    SELECT $1::int, id, 123.45, 0 FROM accounts WHERE code = '1101'
    UNION ALL SELECT $1::int, id, 0, 123.45 FROM accounts WHERE code = '4101'`,
      [entry.rows[0].id],
    );
    const lines = await query('SELECT id FROM journal_entry_lines WHERE journal_entry_id = $1', [
      entry.rows[0].id,
    ]);
    expect(lines.rows).toHaveLength(2);
    const shift = await query(
      `INSERT INTO pos_shifts (shift_number, warehouse_id, cashier_user_id, terminal_id)
    SELECT $1, t.warehouse_id, u.id, t.id FROM pos_terminals t CROSS JOIN users u LIMIT 1 RETURNING id`,
      [marker],
    );
    expect(shift.rows).toHaveLength(1);
    await query(
      `INSERT INTO pos_cash_movements (shift_id, movement_type, amount, reason)
    VALUES ($1, 'deposit', 25.50, 'اختبار استرجاع')`,
      [shift.rows[0].id],
    );
    const before = await readBackupSnapshot();
    const backup = await createBackup();
    try {
      await query("SELECT setval('seq_journal_entries_number', 1001)");
      expect(await restoreBackup(backup.file)).toEqual({ restored: BACKUP_TABLES.length });
      const after = await readBackupSnapshot();
      const normalized = (rows: unknown[]) => rows.map((row) => JSON.stringify(row)).sort();
      for (const table of BACKUP_TABLES) {
        expect(normalized(after[table]), table).toEqual(normalized(before[table]));
      }
      const next = await query("SELECT nextval('seq_journal_entries_number') AS n");
      expect(Number(next.rows[0].n)).toBeGreaterThan(documentCounter);
    } finally {
      await fs.unlink(backup.path);
    }
  },
  120000,
);
