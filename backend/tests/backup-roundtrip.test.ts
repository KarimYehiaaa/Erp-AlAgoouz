import { expect, it } from 'vitest';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { query } from '../src/database/pool.ts';
import { encrypt, decrypt } from '../src/utils/crypto.ts';
import {
  BACKUP_TABLES,
  createBackup,
  readBackupSnapshot,
  restoreBackup,
} from '../src/services/backupService.ts';

// Run explicitly on the disposable recovery database; never truncate the shared suite database.
it.skipIf(
  process.env.DB_NAME !== 'bin_al_ajouz_restore_test' && process.env.ERP_RESTORE_TEST !== '1',
)(
  'restores every table without changing records',
  async () => {
    // Add a composite MATCH FULL relationship in the disposable recovery database so
    // the restore validator is exercised against both multi-column and partial-null keys.
    await query(`
      ALTER TABLE product_categories
        ADD COLUMN IF NOT EXISTS restore_key_a TEXT,
        ADD COLUMN IF NOT EXISTS restore_key_b TEXT;
      CREATE UNIQUE INDEX IF NOT EXISTS uq_product_categories_restore_key
        ON product_categories (restore_key_a, restore_key_b);
      ALTER TABLE products
        ADD COLUMN IF NOT EXISTS restore_category_key_a TEXT,
        ADD COLUMN IF NOT EXISTS restore_category_key_b TEXT;
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'fk_products_restore_category_key'
        ) THEN
          ALTER TABLE products
            ADD CONSTRAINT fk_products_restore_category_key
            FOREIGN KEY (restore_category_key_a, restore_category_key_b)
            REFERENCES product_categories (restore_key_a, restore_key_b)
            MATCH FULL;
        END IF;
      END $$;
    `);
    // Arrays stored in JSONB must not be sent back as PostgreSQL array literals.
    await query(
      `UPDATE workflows_nodes SET settings = '[{"label":"اختبار"},1,true]'::jsonb WHERE id = (SELECT MIN(id) FROM workflows_nodes)`,
    );
    const marker = randomUUID();
    const restoreKey = `restore-${marker}`;
    const category = await query(
      `INSERT INTO product_categories (name_ar, restore_key_a, restore_key_b)
       VALUES ($1, $2, $3) RETURNING id`,
      [`تصنيف اختبار الاستعادة ${marker}`, `${restoreKey}-a`, `${restoreKey}-b`],
    );
    // Historical movements stay in their original warehouse after routing changes.
    const warehouses = await query('SELECT id FROM warehouses ORDER BY id LIMIT 2');
    expect(warehouses.rows).toHaveLength(2);
    const product = await query(
      `INSERT INTO products (
         sku, name_ar, purchase_price, sale_price, primary_warehouse_id, category_id,
         restore_category_key_a, restore_category_key_b
       ) VALUES ($1, $2, 10, 15, $3, $4, $5, $6) RETURNING id`,
      [
        restoreKey,
        `اختبار حفظ حركة تاريخية ${marker}`,
        warehouses.rows[0].id,
        category.rows[0].id,
        `${restoreKey}-a`,
        `${restoreKey}-b`,
      ],
    );
    await query(
      `INSERT INTO stock_movements (product_id, to_warehouse_id, movement_type, quantity)
       VALUES ($1, $2, 'production', 0.25)`,
      [product.rows[0].id, warehouses.rows[0].id],
    );
    await query('UPDATE products SET primary_warehouse_id = $1 WHERE id = $2', [
      warehouses.rows[1].id,
      product.rows[0].id,
    ]);
    const documentCounter = Date.now();
    const entry = await query(
      `INSERT INTO journal_entries (entry_number, description, status, entry_date)
    VALUES ($1, 'اختبار استرجاع فترة مغلقة', 'draft', '2025-07-15') RETURNING id`,
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
    const closedPeriod = await query(
      `INSERT INTO financial_periods (period_start, period_end, status, closed_at, notes)
       VALUES ('2025-07-01', '2025-07-31', 'closed', NOW(), $1) RETURNING id`,
      [`اختبار استعادة الفترة المغلقة ${marker}`],
    );
    const before = await readBackupSnapshot();
    const backup = await createBackup();
    try {
      await query("SELECT setval('seq_journal_entries_number', 1001)");
      expect(await restoreBackup(backup.file)).toEqual({ restored: BACKUP_TABLES.length });
      const after = await readBackupSnapshot();
      const restoredPeriod = await query(
        `SELECT fp.status, je.entry_date, je.description
         FROM financial_periods fp
         JOIN journal_entries je ON je.entry_date BETWEEN fp.period_start AND fp.period_end
         WHERE fp.id = $1 AND je.id = $2`,
        [closedPeriod.rows[0].id, entry.rows[0].id],
      );
      expect(restoredPeriod.rows).toEqual([
        {
          status: 'closed',
          entry_date: '2025-07-15',
          description: 'اختبار استرجاع فترة مغلقة',
        },
      ]);
      const normalized = (rows: unknown[]) => rows.map((row) => JSON.stringify(row)).sort();
      for (const table of BACKUP_TABLES) {
        expect(normalized(after[table]), table).toEqual(normalized(before[table]));
      }
      const next = await query("SELECT nextval('seq_journal_entries_number') AS n");
      expect(Number(next.rows[0].n)).toBeGreaterThan(documentCounter);
      const originalFile = await fs.readFile(backup.path, 'utf8');
      try {
        const envelope = JSON.parse(originalFile);
        const damaged = JSON.parse(decrypt(envelope.payload));
        damaged.data.stock_movements[0].product_id = 2147483647;
        const restoreProduct = damaged.data.products.find((row) => row.sku === restoreKey);
        expect(restoreProduct).toBeDefined();
        restoreProduct.restore_category_key_b = `${restoreKey}-missing`;
        await fs.writeFile(
          backup.path,
          JSON.stringify({ encrypted: true, payload: encrypt(JSON.stringify(damaged)) }),
        );
        await expect(restoreBackup(backup.file)).rejects.toMatchObject({ statusCode: 400 });
        const preserved = await readBackupSnapshot();
        for (const table of BACKUP_TABLES) {
          expect(normalized(preserved[table]), `rejected restore: ${table}`).toEqual(
            normalized(after[table]),
          );
        }

        // MATCH FULL must reject a partially-null composite key even when the other
        // component points at a real value; SQL equality alone would otherwise be easy to miss.
        const partialNull = JSON.parse(decrypt(envelope.payload));
        const partialNullProduct = partialNull.data.products.find((row) => row.sku === restoreKey);
        partialNullProduct.restore_category_key_b = null;
        await fs.writeFile(
          backup.path,
          JSON.stringify({ encrypted: true, payload: encrypt(JSON.stringify(partialNull)) }),
        );
        await expect(restoreBackup(backup.file)).rejects.toMatchObject({ statusCode: 400 });
        const afterPartialNull = await readBackupSnapshot();
        for (const table of BACKUP_TABLES) {
          expect(
            normalized(afterPartialNull[table]),
            `partial-null restore rejected: ${table}`,
          ).toEqual(normalized(after[table]));
        }
      } finally {
        // Even a failing regression must leave the disposable database valid.
        await fs.writeFile(backup.path, originalFile);
        await restoreBackup(backup.file);
      }
    } finally {
      await fs.unlink(backup.path);
    }
  },
  120000,
);
