import { expect, it } from 'vitest';
import { getClient } from '../src/database/pool.ts';

const foreignKeyIndexes = [
  'idx_fk_activity_logs_user_id',
  'idx_fk_bank_reconciliations_reconciled_by',
  'idx_fk_employee_advances_expense_id',
  'idx_fk_employee_advances_user_id',
  'idx_fk_employee_attendance_user_id',
  'idx_fk_employees_shift_id',
  'idx_fk_financial_periods_closed_by',
  'idx_fk_idempotency_records_user_id',
  'idx_fk_inventory_cost_layer_consumptions_layer_id',
  'idx_fk_inventory_cost_layer_consumptions_stock_movement_id',
  'idx_fk_inventory_cost_layers_source_movement_id',
  'idx_fk_inventory_cost_layers_warehouse_id',
  'idx_fk_invoice_items_product_id',
  'idx_fk_journal_entries_created_by',
  'idx_fk_manager_approval_requests_decided_by_user_id',
  'idx_fk_manager_approval_requests_requester_user_id',
  'idx_fk_manager_approval_requests_terminal_id',
  'idx_fk_menus_created_by',
  'idx_fk_partner_drawings_created_by',
  'idx_fk_payroll_items_employee_id',
  'idx_fk_payroll_runs_expense_id',
  'idx_fk_payroll_runs_user_id',
  'idx_fk_pos_cash_movements_authorized_by',
  'idx_fk_pos_shifts_terminal_id',
  'idx_fk_product_categories_parent_id',
  'idx_fk_product_recipes_created_by',
  'idx_fk_purchase_invoice_items_warehouse_id',
  'idx_fk_purchase_invoices_created_by',
  'idx_fk_purchase_invoices_warehouse_id',
  'idx_fk_purchase_orders_created_by',
  'idx_fk_purchase_return_items_purchase_invoice_item_id',
  'idx_fk_purchase_returns_created_by',
  'idx_fk_purchase_returns_warehouse_id',
  'idx_fk_settings_updated_by',
  'idx_fk_stocktakes_created_by',
  'idx_fk_supplier_invoices_supplier_id',
  'idx_fk_supplier_invoices_user_id',
];

it('adds an index for each foreign key identified by the live advisor', async () => {
  const client = await getClient();
  try {
    const indexes = await client.query<{
      indexname: string;
      indexdef: string;
      covers_foreign_key_column: boolean;
    }>(
      `SELECT indexes.indexname, indexes.indexdef,
              EXISTS (
                SELECT 1
                FROM pg_index index_meta
                JOIN pg_constraint fk
                  ON fk.conrelid = index_meta.indrelid
                 AND fk.contype = 'f'
                 AND cardinality(fk.conkey) = 1
                 AND fk.conkey[1] = index_meta.indkey[0]
                WHERE index_meta.indexrelid = format('public.%I', indexes.indexname)::regclass
                  AND index_meta.indisvalid
                  AND index_meta.indnkeyatts = 1
              ) AS covers_foreign_key_column
       FROM pg_indexes indexes
       WHERE indexes.schemaname = 'public' AND indexes.indexname = ANY($1::text[])
       ORDER BY indexes.indexname`,
      [foreignKeyIndexes],
    );

    expect(indexes.rows.map((row) => row.indexname)).toEqual([...foreignKeyIndexes].sort());
    expect(indexes.rows.every((row) => row.indexdef.includes('USING btree'))).toBe(true);
    expect(indexes.rows.every((row) => row.covers_foreign_key_column)).toBe(true);
  } finally {
    client.release();
  }
});
