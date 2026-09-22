import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Database/application schema contracts', () => {
  it('defines the single-shop warehouse scope migration', () => {
    const migrationDir = path.resolve(process.cwd(), 'migrations');
    expect(fs.readdirSync(migrationDir)).toContain('069_single_shop_user_scope.sql');
    const migrationText = fs
      .readdirSync(migrationDir)
      .filter((file) => file.endsWith('.sql'))
      .sort()
      .map((file) => fs.readFileSync(path.join(migrationDir, file), 'utf8'))
      .join('\n');

    expect(migrationText).toContain('warehouse_id');
  });

  it('defines database guardrails for non-negative stock and financial values', () => {
    const migrationDir = path.resolve(process.cwd(), 'migrations');
    const migrationText = fs
      .readdirSync(migrationDir)
      .filter((file) => file.endsWith('.sql'))
      .sort()
      .map((file) => fs.readFileSync(path.join(migrationDir, file), 'utf8'))
      .join('\n');

    expect(migrationText).toContain('inventory_quantity_non_negative');
    expect(migrationText).toContain('sale_items_values_valid');
    expect(migrationText).toContain('sales_amounts_non_negative');
    expect(migrationText).toContain('payments_amount_non_negative');
    expect(migrationText).toContain('idx_products_active_sku_unique');
    expect(migrationText).toContain('SET branch_id = 1');
    expect(migrationText).toContain("r.name IN ('cashier', 'warehouse')");
  });
});
