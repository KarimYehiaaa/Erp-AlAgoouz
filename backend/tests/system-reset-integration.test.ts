import { describe, expect, it } from 'vitest';
import { getClient, query } from '../src/database/pool.ts';
import { assertSafeTestDatabase } from '../scripts/testDatabaseSafety.ts';
import { buildBackupDownload, clearAllData } from '../src/services/backupService.ts';
import { decrypt } from '../src/utils/crypto.ts';
import { inventoryRepository } from '../src/repositories/inventory.repository.ts';

describe.runIf(process.env.RUN_SYSTEM_RESET_INTEGRATION === '1')('full system reset', () => {
  it('empties business history while preserving catalog, recipes, prices and configuration', async () => {
    assertSafeTestDatabase({ host: process.env.DB_HOST, database: process.env.DB_NAME });
    const product = (await query(
      'SELECT id, category_id, sale_price, purchase_price, wholesale_price FROM products ORDER BY id LIMIT 1',
    )).rows[0];
    const warehouse = (await query('SELECT id FROM warehouses ORDER BY id LIMIT 1')).rows[0];
    expect(product).toBeDefined();
    expect(warehouse).toBeDefined();

    const recipe = (await query(
      `INSERT INTO product_recipes (product_id, name_ar)
       VALUES ($1, 'وصفة اختبار التصفير') RETURNING id`,
      [product.id],
    )).rows[0];
    await query(
      `INSERT INTO product_recipe_items (recipe_id, ingredient_product_id, quantity, unit_code)
       VALUES ($1, $2, 2.5, 'count')`,
      [recipe.id, product.id],
    );
    await query(
      `INSERT INTO inventory (product_id, warehouse_id, quantity)
       VALUES ($1, $2, 17)
       ON CONFLICT (product_id, warehouse_id, COALESCE(batch_number, ''))
       DO UPDATE SET quantity = 17`,
      [product.id, warehouse.id],
    );
    await query(
      `INSERT INTO settings (key, value)
       VALUES ('sales_opening_balance:2026-09', '{"amount": 999}'::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    );
    await query(
      `INSERT INTO journal_entries (entry_number, entry_date, status, description)
       VALUES ('RESET-INTEGRATION-1', CURRENT_DATE, 'draft', 'reset test')`,
    );
    await query(
      `UPDATE customers SET opening_balance = 90, balance = 90, current_balance = 90, loyalty_points = 5`,
    );
    await query('UPDATE suppliers SET opening_balance = 80, balance = 80');

    const backup = await buildBackupDownload();
    expect(backup.file).toMatch(/^backup-.*\.json$/);
    const envelope = JSON.parse(backup.content);
    expect(envelope.encrypted).toBe(true);
    const backupData = JSON.parse(decrypt(envelope.payload)).data;
    expect(backupData.inventory.some((row: any) => row.product_id === product.id)).toBe(true);
    expect(backupData.product_recipes.some((row: any) => row.id === recipe.id)).toBe(true);

    await clearAllData();

    const productAfter = (await query(
      'SELECT id, category_id, sale_price, purchase_price, wholesale_price FROM products WHERE id = $1',
      [product.id],
    )).rows[0];
    expect(productAfter).toEqual(product);
    expect((await query('SELECT COUNT(*)::int AS n FROM product_categories')).rows[0].n).toBeGreaterThan(0);
    expect((await query('SELECT COUNT(*)::int AS n FROM product_recipes WHERE id = $1', [recipe.id])).rows[0].n).toBe(1);
    expect((await query('SELECT quantity FROM product_recipe_items WHERE recipe_id = $1', [recipe.id])).rows[0].quantity).toBe(2.5);
    for (const table of [
      'inventory', 'stock_movements', 'customers', 'suppliers', 'sales', 'purchase_invoices',
      'payments', 'expenses', 'journal_entries', 'journal_entry_lines', 'pos_shifts',
      'stocktakes', 'inventory_cost_layers', 'financial_periods',
    ]) {
      const count = await query(`SELECT COUNT(*)::int AS n FROM ${table}`);
      expect(count.rows[0].n, table).toBe(0);
    }
    expect((await query("SELECT COUNT(*)::int AS n FROM settings WHERE key LIKE 'sales_opening_balance:%'")).rows[0].n).toBe(0);
    expect((await query('SELECT COUNT(*)::int AS n FROM users')).rows[0].n).toBeGreaterThan(0);
    expect((await query('SELECT COUNT(*)::int AS n FROM warehouses')).rows[0].n).toBeGreaterThan(0);
    const inventoryView = await inventoryRepository.getInventoryList(warehouse.id);
    expect(inventoryView.find((row) => row.product_id === product.id)?.quantity).toBe(0);

    // A new period can create business records using the retained catalog.
    const client = await getClient();
    try {
      await client.query('BEGIN');
      const number = await client.query("SELECT nextval('seq_sales_number') AS n");
      expect(Number(number.rows[0].n)).toBe(10000);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });
});
