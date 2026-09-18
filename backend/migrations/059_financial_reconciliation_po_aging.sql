-- ==============================================================================
-- 059_financial_reconciliation_po_aging.sql
-- بن العجوز ERP — مطابقة البنك والخزينة + دورة أوامر الشراء والاستلام المخزني
-- ==============================================================================

-- 1. جدول مطابقة وتسوية الحسابات البنكية والخزينة (Bank & Treasury Reconciliation)
CREATE SEQUENCE IF NOT EXISTS seq_bank_reconciliations_number START WITH 1001;

CREATE TABLE IF NOT EXISTS bank_reconciliations (
  id SERIAL PRIMARY KEY,
  reconciliation_number VARCHAR(50) UNIQUE NOT NULL,
  account_id INT NOT NULL REFERENCES accounts(id),
  statement_date DATE NOT NULL,
  statement_balance NUMERIC(15, 2) NOT NULL DEFAULT 0,
  ledger_balance NUMERIC(15, 2) NOT NULL DEFAULT 0,
  reconciled_balance NUMERIC(15, 2) NOT NULL DEFAULT 0,
  difference NUMERIC(15, 2) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'completed' CHECK (status IN ('draft', 'completed', 'cancelled')),
  notes TEXT,
  reconciled_by INT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bank_reconciliations_acc_date 
  ON bank_reconciliations(account_id, statement_date);

-- 2. جدول أوامر الشراء (Purchase Orders)
CREATE SEQUENCE IF NOT EXISTS seq_purchase_orders_number START WITH 1001;

CREATE TABLE IF NOT EXISTS purchase_orders (
  id SERIAL PRIMARY KEY,
  po_number VARCHAR(50) UNIQUE NOT NULL,
  supplier_id INT REFERENCES suppliers(id),
  warehouse_id INT REFERENCES warehouses(id),
  order_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_date DATE,
  status VARCHAR(25) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'partially_received', 'received', 'cancelled')),
  total_amount NUMERIC(15, 2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  notes TEXT,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_po_supplier_id ON purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_po_warehouse_id ON purchase_orders(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_po_order_date ON purchase_orders(order_date);

-- 3. جدول بنود أوامر الشراء (Purchase Order Items)
CREATE TABLE IF NOT EXISTS purchase_order_items (
  id SERIAL PRIMARY KEY,
  purchase_order_id INT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id INT NOT NULL REFERENCES products(id),
  quantity NUMERIC(12, 3) NOT NULL CHECK (quantity > 0),
  received_quantity NUMERIC(12, 3) NOT NULL DEFAULT 0 CHECK (received_quantity >= 0),
  unit_price NUMERIC(15, 2) NOT NULL CHECK (unit_price >= 0),
  total_amount NUMERIC(15, 2) NOT NULL CHECK (total_amount >= 0),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_poi_po_id ON purchase_order_items(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_poi_product_id ON purchase_order_items(product_id);

-- 4. إضافة صلاحيات جديدة في جدول permissions
INSERT INTO permissions (code, name_ar, module)
VALUES
  ('reconciliation.view', 'عرض مطابقات البنك والخزينة', 'accounting'),
  ('reconciliation.manage', 'إجراء مطابقة وتسوية نقدية وبنكية', 'accounting'),
  ('purchase_orders.view', 'عرض أوامر الشراء', 'purchases'),
  ('purchase_orders.manage', 'إنشاء واعتماد واستلام أوامر الشراء', 'purchases')
ON CONFLICT (code) DO UPDATE SET
  name_ar = EXCLUDED.name_ar,
  module = EXCLUDED.module;

-- ربط الصلاحيات بالأدوار القياسية
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name IN ('owner', 'admin', 'sys_admin', 'manager')
  AND p.code IN ('reconciliation.view', 'reconciliation.manage', 'purchase_orders.view', 'purchase_orders.manage')
ON CONFLICT DO NOTHING;
