-- Add B-tree indexes to child-side foreign keys flagged by the live advisor.
-- These support joins and avoid scanning child rows when referenced rows change.
CREATE INDEX IF NOT EXISTS idx_fk_activity_logs_user_id
  ON public.activity_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_fk_bank_reconciliations_reconciled_by
  ON public.bank_reconciliations (reconciled_by);
CREATE INDEX IF NOT EXISTS idx_fk_employee_advances_expense_id
  ON public.employee_advances (expense_id);
CREATE INDEX IF NOT EXISTS idx_fk_employee_advances_user_id
  ON public.employee_advances (user_id);
CREATE INDEX IF NOT EXISTS idx_fk_employee_attendance_user_id
  ON public.employee_attendance (user_id);
CREATE INDEX IF NOT EXISTS idx_fk_employees_shift_id
  ON public.employees (shift_id);
CREATE INDEX IF NOT EXISTS idx_fk_financial_periods_closed_by
  ON public.financial_periods (closed_by);
CREATE INDEX IF NOT EXISTS idx_fk_idempotency_records_user_id
  ON public.idempotency_records (user_id);
CREATE INDEX IF NOT EXISTS idx_fk_inventory_cost_layer_consumptions_layer_id
  ON public.inventory_cost_layer_consumptions (layer_id);
CREATE INDEX IF NOT EXISTS idx_fk_inventory_cost_layer_consumptions_stock_movement_id
  ON public.inventory_cost_layer_consumptions (stock_movement_id);
CREATE INDEX IF NOT EXISTS idx_fk_inventory_cost_layers_source_movement_id
  ON public.inventory_cost_layers (source_movement_id);
CREATE INDEX IF NOT EXISTS idx_fk_inventory_cost_layers_warehouse_id
  ON public.inventory_cost_layers (warehouse_id);
CREATE INDEX IF NOT EXISTS idx_fk_invoice_items_product_id
  ON public.invoice_items (product_id);
CREATE INDEX IF NOT EXISTS idx_fk_journal_entries_created_by
  ON public.journal_entries (created_by);
CREATE INDEX IF NOT EXISTS idx_fk_manager_approval_requests_decided_by_user_id
  ON public.manager_approval_requests (decided_by_user_id);
CREATE INDEX IF NOT EXISTS idx_fk_manager_approval_requests_requester_user_id
  ON public.manager_approval_requests (requester_user_id);
CREATE INDEX IF NOT EXISTS idx_fk_manager_approval_requests_terminal_id
  ON public.manager_approval_requests (terminal_id);
CREATE INDEX IF NOT EXISTS idx_fk_menus_created_by
  ON public.menus (created_by);
CREATE INDEX IF NOT EXISTS idx_fk_partner_drawings_created_by
  ON public.partner_drawings (created_by);
CREATE INDEX IF NOT EXISTS idx_fk_payroll_items_employee_id
  ON public.payroll_items (employee_id);
CREATE INDEX IF NOT EXISTS idx_fk_payroll_runs_expense_id
  ON public.payroll_runs (expense_id);
CREATE INDEX IF NOT EXISTS idx_fk_payroll_runs_user_id
  ON public.payroll_runs (user_id);
CREATE INDEX IF NOT EXISTS idx_fk_pos_cash_movements_authorized_by
  ON public.pos_cash_movements (authorized_by);
CREATE INDEX IF NOT EXISTS idx_fk_pos_shifts_terminal_id
  ON public.pos_shifts (terminal_id);
CREATE INDEX IF NOT EXISTS idx_fk_product_categories_parent_id
  ON public.product_categories (parent_id);
CREATE INDEX IF NOT EXISTS idx_fk_product_recipes_created_by
  ON public.product_recipes (created_by);
CREATE INDEX IF NOT EXISTS idx_fk_purchase_invoice_items_warehouse_id
  ON public.purchase_invoice_items (warehouse_id);
CREATE INDEX IF NOT EXISTS idx_fk_purchase_invoices_created_by
  ON public.purchase_invoices (created_by);
CREATE INDEX IF NOT EXISTS idx_fk_purchase_invoices_warehouse_id
  ON public.purchase_invoices (warehouse_id);
CREATE INDEX IF NOT EXISTS idx_fk_purchase_orders_created_by
  ON public.purchase_orders (created_by);
CREATE INDEX IF NOT EXISTS idx_fk_purchase_return_items_purchase_invoice_item_id
  ON public.purchase_return_items (purchase_invoice_item_id);
CREATE INDEX IF NOT EXISTS idx_fk_purchase_returns_created_by
  ON public.purchase_returns (created_by);
CREATE INDEX IF NOT EXISTS idx_fk_purchase_returns_warehouse_id
  ON public.purchase_returns (warehouse_id);
CREATE INDEX IF NOT EXISTS idx_fk_settings_updated_by
  ON public.settings (updated_by);
CREATE INDEX IF NOT EXISTS idx_fk_stocktakes_created_by
  ON public.stocktakes (created_by);
CREATE INDEX IF NOT EXISTS idx_fk_supplier_invoices_supplier_id
  ON public.supplier_invoices (supplier_id);
CREATE INDEX IF NOT EXISTS idx_fk_supplier_invoices_user_id
  ON public.supplier_invoices (user_id);
