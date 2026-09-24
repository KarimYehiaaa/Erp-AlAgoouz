import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { BACKUP_TABLES } from '../src/services/backupService.ts';

describe('Database/application schema contracts', () => {
  it('defines the single-shop warehouse scope migration', () => {
    const migrationDir = path.resolve(process.cwd(), 'migrations');
    expect(fs.readdirSync(migrationDir)).toContain('075_remove_legacy_branch_scope.sql');
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
    expect(migrationText).toContain('DROP COLUMN IF EXISTS branch_id');
    expect(migrationText).toContain("r.name IN ('cashier', 'warehouse')");
  });

  it('includes every application table in the encrypted backup contract', () => {
    const migrationDir = path.resolve(process.cwd(), 'migrations');
    const tableNames = fs
      .readdirSync(migrationDir)
      .filter((file) => file.endsWith('.sql'))
      .flatMap((file) =>
        Array.from(
          fs
            .readFileSync(path.join(migrationDir, file), 'utf8')
            .matchAll(/CREATE TABLE(?: IF NOT EXISTS)?\s+([a-zA-Z0-9_]+)/gi),
        ),
      )
      .map((match) => match[1].toLowerCase());
    const missing = [...new Set(tableNames)].filter((table) => !BACKUP_TABLES.includes(table));

    expect(missing).toEqual([]);
  });
});
