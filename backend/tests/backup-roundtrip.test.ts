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
  'restores every business record and invalidates historical authorization',
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
    SELECT $1, t.warehouse_id, u.id, t.id FROM pos_terminals t CROSS JOIN users u LIMIT 1
    RETURNING id, cashier_user_id, warehouse_id, terminal_id`,
      [marker],
    );
    expect(shift.rows).toHaveLength(1);
    await query(
      `INSERT INTO pos_cash_movements (shift_id, movement_type, amount, reason)
    VALUES ($1, 'deposit', 25.50, 'اختبار استرجاع')`,
      [shift.rows[0].id],
    );
    const supplier = await query(
      `INSERT INTO suppliers (code, name_ar) VALUES ($1, $2) RETURNING id`,
      [`RESTORE-SUP-${marker.slice(0, 14)}`, `مورد اختبار الاستعادة ${marker}`],
    );
    const customer = await query(
      `INSERT INTO customers (code, name_ar) VALUES ($1, $2) RETURNING id`,
      [`RESTORE-CUS-${marker.slice(0, 14)}`, `عميل اختبار الاستعادة ${marker}`],
    );
    const sale = await query(
      `INSERT INTO sales (
         sale_number, sale_type, customer_id, warehouse_id, user_id, subtotal, total_amount,
         payment_status, status, notes
       ) VALUES ($1, 'wholesale', $2, $3, $4, 187.50, 187.50, 'refunded', 'returned', $5)
       RETURNING id`,
      [
        `RESTORE-SALE-${marker}`,
        customer.rows[0].id,
        warehouses.rows[0].id,
        shift.rows[0].cashier_user_id,
        `مرتجع محفوظ ${marker}`,
      ],
    );
    await query(
      `INSERT INTO sale_items (
         sale_id, product_id, quantity, unit_price, cost_price, total_amount
       ) VALUES ($1, $2, 2.5, 75, 42, 187.50)`,
      [sale.rows[0].id, product.rows[0].id],
    );
    const invoice = await query(
      `INSERT INTO invoices (
         invoice_number, sale_id, customer_id, invoice_type, subtotal, total_amount,
         payment_status, user_id
       ) VALUES ($1, $2, $3, 'sale', 187.50, 187.50, 'refunded', $4) RETURNING id`,
      [
        `RESTORE-INV-${marker}`,
        sale.rows[0].id,
        customer.rows[0].id,
        shift.rows[0].cashier_user_id,
      ],
    );
    await query(
      `INSERT INTO invoice_items (invoice_id, product_id, description, quantity, unit_price, total_amount)
       VALUES ($1, $2, $3, 2.5, 75, 187.50)`,
      [invoice.rows[0].id, product.rows[0].id, `بند فاتورة اختبار ${marker}`],
    );
    const payment = await query(
      `INSERT INTO payments (payment_number, reference_type, reference_id, amount, payment_method, user_id, journal_entry_id)
       VALUES ($1, 'sale', $2, 187.50, 'cash', $3, $4) RETURNING id`,
      [`RESTORE-PAY-${marker}`, sale.rows[0].id, shift.rows[0].cashier_user_id, entry.rows[0].id],
    );
    const purchase = await query(
      `INSERT INTO purchase_invoices (
         invoice_number, invoice_date, warehouse_id, supplier_id, subtotal, total_amount, created_by
       ) VALUES ($1, '2026-09-20', $2, $3, 320, 320, $4) RETURNING id`,
      [
        `RESTORE-PUR-${marker}`,
        warehouses.rows[0].id,
        supplier.rows[0].id,
        shift.rows[0].cashier_user_id,
      ],
    );
    const purchaseItem = await query(
      `INSERT INTO purchase_invoice_items (
         purchase_invoice_id, product_id, warehouse_id, unit, quantity, unit_price, total_amount
       ) VALUES ($1, $2, $3, 'kg', 4, 80, 320) RETURNING id`,
      [purchase.rows[0].id, product.rows[0].id, warehouses.rows[0].id],
    );
    const purchaseReturn = await query(
      `INSERT INTO purchase_returns (
         return_number, purchase_invoice_id, supplier_id, warehouse_id, subtotal, total_amount, created_by
       ) VALUES ($1, $2, $3, $4, 80, 80, $5) RETURNING id`,
      [
        `RESTORE-PR-${marker}`,
        purchase.rows[0].id,
        supplier.rows[0].id,
        warehouses.rows[0].id,
        shift.rows[0].cashier_user_id,
      ],
    );
    await query(
      `INSERT INTO purchase_return_items (
         purchase_return_id, purchase_invoice_item_id, product_id, quantity, unit_price, total_amount
       ) VALUES ($1, $2, $3, 1, 80, 80)`,
      [purchaseReturn.rows[0].id, purchaseItem.rows[0].id, product.rows[0].id],
    );
    const expenseCategory = await query(
      `INSERT INTO expense_categories (name_ar, slug) VALUES ($1, $2) RETURNING id`,
      [`مصروف اختبار الاستعادة ${marker}`, `restore-${marker}`],
    );
    await query(
      `INSERT INTO expenses (expense_number, category_id, title, amount, expense_date, user_id)
       VALUES ($1, $2, $3, 42.75, '2026-09-21', $4)`,
      [
        `RESTORE-EXP-${marker}`,
        expenseCategory.rows[0].id,
        `مصروف محفوظ ${marker}`,
        shift.rows[0].cashier_user_id,
      ],
    );
    const reconciliation = await query(
      `INSERT INTO bank_reconciliations (
         reconciliation_number, account_id, statement_date, statement_balance,
         ledger_balance, reconciled_balance, difference, reconciled_by
       ) SELECT $1, id, '2026-09-22', 187.50, 187.50, 187.50, 0, $2
         FROM accounts WHERE code = '1101' RETURNING id`,
      [`RESTORE-BANK-${marker}`, shift.rows[0].cashier_user_id],
    );
    expect(reconciliation.rows).toHaveLength(1);
    await query(
      `INSERT INTO bank_statement_transactions (
         reconciliation_id, transaction_date, description, reference, debit, amount,
         status, matched_payment_id, matched_amount
       ) VALUES ($1, '2026-09-20', $2, $3, 187.50, 187.50, 'matched', $4, 187.50)`,
      [reconciliation.rows[0].id, `مطابقة دفعة ${marker}`, `RESTORE-${marker}`, payment.rows[0].id],
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
      expect(
        (await query('SELECT journal_entry_id FROM payments WHERE id=$1', [payment.rows[0].id]))
          .rows[0].journal_entry_id,
      ).toBe(entry.rows[0].id);
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
        const businessRows = (rows: Record<string, unknown>[]) =>
          rows.map((row) => {
            const copy = { ...row };
            if (table === 'users') delete copy.session_generation;
            if (table === 'refresh_tokens') delete copy.revoked;
            if (table === 'manager_override_tokens') delete copy.used_at;
            return copy;
          });
        expect(normalized(businessRows(after[table])), table).toEqual(
          normalized(businessRows(before[table])),
        );
      }
      for (const user of after.users) {
        expect(user.session_generation).toBeTruthy();
        expect(user.session_generation).not.toBe(
          before.users.find((row) => row.id === user.id)!.session_generation,
        );
      }
      expect(after.refresh_tokens.every((row) => row.revoked === true)).toBe(true);
      expect(after.manager_override_tokens.every((row) => row.used_at !== null)).toBe(true);
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
