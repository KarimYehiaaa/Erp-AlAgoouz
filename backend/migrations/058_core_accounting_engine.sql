-- 058_core_accounting_engine.sql
-- ============================================================================
-- بن العجوز ERP — المحرك المحاسبي المتكامل (Double-Entry General Ledger)
-- ودورة مرتجعات المشتريات (Purchase Returns / Debit Notes)
-- ============================================================================

-- 1. جدول شجرة الحسابات (Chart of Accounts)
CREATE TABLE IF NOT EXISTS accounts (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name_ar VARCHAR(255) NOT NULL,
  name_en VARCHAR(255),
  account_type VARCHAR(20) NOT NULL CHECK (account_type IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
  normal_balance VARCHAR(10) NOT NULL CHECK (normal_balance IN ('debit', 'credit')),
  parent_id INTEGER REFERENCES accounts(id) ON DELETE RESTRICT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_accounts_code ON accounts(code);
CREATE INDEX IF NOT EXISTS idx_accounts_parent_id ON accounts(parent_id);
CREATE INDEX IF NOT EXISTS idx_accounts_type ON accounts(account_type);

-- 2. متسلسلة قيود اليومية
CREATE SEQUENCE IF NOT EXISTS seq_journal_entries_number START WITH 1001;

-- 3. جدول ترويسة قيود اليومية (Journal Entries)
CREATE TABLE IF NOT EXISTS journal_entries (
  id SERIAL PRIMARY KEY,
  entry_number VARCHAR(50) NOT NULL UNIQUE,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'posted' CHECK (status IN ('draft', 'posted', 'voided')),
  reference_type VARCHAR(50) CHECK (reference_type IN ('sale', 'purchase', 'payment', 'expense', 'payroll', 'stocktake', 'purchase_return', 'manual', 'opening', 'transfer')),
  reference_id INTEGER,
  description TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON journal_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_journal_entries_ref ON journal_entries(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_status ON journal_entries(status);

-- 4. جدول أسطر القيود اليومية (Journal Entry Lines)
CREATE TABLE IF NOT EXISTS journal_entry_lines (
  id SERIAL PRIMARY KEY,
  journal_entry_id INTEGER NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  debit NUMERIC(15, 2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit NUMERIC(15, 2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  description TEXT,
  warehouse_id INTEGER REFERENCES warehouses(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_debit_credit_positive CHECK (debit > 0 OR credit > 0),
  CONSTRAINT chk_debit_xor_credit CHECK (NOT (debit > 0 AND credit > 0))
);

CREATE INDEX IF NOT EXISTS idx_jel_entry_id ON journal_entry_lines(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_jel_account_id ON journal_entry_lines(account_id);
CREATE INDEX IF NOT EXISTS idx_jel_warehouse_id ON journal_entry_lines(warehouse_id);

-- 5. متسلسلة مرتجعات المشتريات
CREATE SEQUENCE IF NOT EXISTS seq_purchase_returns_number START WITH 1001;

-- 6. جدول مرتجعات المشتريات (Purchase Returns)
CREATE TABLE IF NOT EXISTS purchase_returns (
  id SERIAL PRIMARY KEY,
  return_number VARCHAR(50) NOT NULL UNIQUE,
  purchase_invoice_id INTEGER NOT NULL REFERENCES purchase_invoices(id) ON DELETE RESTRICT,
  supplier_id INTEGER REFERENCES suppliers(id) ON DELETE RESTRICT,
  warehouse_id INTEGER REFERENCES warehouses(id) ON DELETE RESTRICT,
  return_date DATE NOT NULL DEFAULT CURRENT_DATE,
  subtotal NUMERIC(15, 2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  tax_amount NUMERIC(15, 2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  total_amount NUMERIC(15, 2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'completed' CHECK (status IN ('draft', 'completed', 'voided')),
  notes TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_purchase_returns_invoice ON purchase_returns(purchase_invoice_id);
CREATE INDEX IF NOT EXISTS idx_purchase_returns_supplier ON purchase_returns(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_returns_date ON purchase_returns(return_date);

-- 7. جدول بنود مرتجع المشتريات (Purchase Return Items)
CREATE TABLE IF NOT EXISTS purchase_return_items (
  id SERIAL PRIMARY KEY,
  purchase_return_id INTEGER NOT NULL REFERENCES purchase_returns(id) ON DELETE CASCADE,
  purchase_invoice_item_id INTEGER REFERENCES purchase_invoice_items(id) ON DELETE RESTRICT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity NUMERIC(15, 3) NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(15, 2) NOT NULL CHECK (unit_price >= 0),
  total_amount NUMERIC(15, 2) NOT NULL CHECK (total_amount >= 0),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pri_return_id ON purchase_return_items(purchase_return_id);
CREATE INDEX IF NOT EXISTS idx_pri_product_id ON purchase_return_items(product_id);

-- 8. بذر دليل الحسابات القياسي المتكامل (Standard Egyptian / Arabic Chart of Accounts)
-- الحسابات الرئيسية (المستوى 1)
INSERT INTO accounts (code, name_ar, name_en, account_type, normal_balance, parent_id, is_system)
VALUES 
  ('1', 'الأصول', 'Assets', 'asset', 'debit', NULL, TRUE),
  ('2', 'الالتزامات', 'Liabilities', 'liability', 'credit', NULL, TRUE),
  ('3', 'حقوق الملكية', 'Equity', 'equity', 'credit', NULL, TRUE),
  ('4', 'الإيرادات', 'Revenue', 'revenue', 'credit', NULL, TRUE),
  ('5', 'المصروفات والتكاليف', 'Expenses', 'expense', 'debit', NULL, TRUE)
ON CONFLICT (code) DO NOTHING;

-- الحسابات الفرعية (المستوى 2)
INSERT INTO accounts (code, name_ar, name_en, account_type, normal_balance, parent_id, is_system)
VALUES
  ('11', 'الأصول المتداولة', 'Current Assets', 'asset', 'debit', (SELECT id FROM accounts WHERE code = '1'), TRUE),
  ('12', 'الأصول غير المتداولة', 'Non-Current Assets', 'asset', 'debit', (SELECT id FROM accounts WHERE code = '1'), TRUE),
  ('21', 'الالتزامات المتداولة', 'Current Liabilities', 'liability', 'credit', (SELECT id FROM accounts WHERE code = '2'), TRUE),
  ('31', 'رأس المال والاحتياطيات', 'Capital & Reserves', 'equity', 'credit', (SELECT id FROM accounts WHERE code = '3'), TRUE),
  ('41', 'إيرادات النشاط الرئيسي', 'Operating Revenue', 'revenue', 'credit', (SELECT id FROM accounts WHERE code = '4'), TRUE),
  ('42', 'إيرادات أخرى', 'Other Income', 'revenue', 'credit', (SELECT id FROM accounts WHERE code = '4'), TRUE),
  ('51', 'تكلفة البضاعة المباعة', 'Cost of Goods Sold (COGS)', 'expense', 'debit', (SELECT id FROM accounts WHERE code = '5'), TRUE),
  ('52', 'المصروفات التشغيلية والإدارية', 'Operating & Administrative Expenses', 'expense', 'debit', (SELECT id FROM accounts WHERE code = '5'), TRUE)
ON CONFLICT (code) DO NOTHING;

-- الحسابات التفصيلية (المستوى 3 و 4)
INSERT INTO accounts (code, name_ar, name_en, account_type, normal_balance, parent_id, is_system)
VALUES
  -- النقدية والبنوك (تحت 11)
  ('1101', 'النقدية وما في حكمها', 'Cash & Cash Equivalents', 'asset', 'debit', (SELECT id FROM accounts WHERE code = '11'), TRUE),
  ('110101', 'الخزينة الرئيسية', 'Main Treasury', 'asset', 'debit', (SELECT id FROM accounts WHERE code = '11'), TRUE),
  ('110102', 'نقدية الفرع والورديات', 'Branch Cash Drawer', 'asset', 'debit', (SELECT id FROM accounts WHERE code = '11'), TRUE),
  ('110103', 'الحسابات البنكية', 'Bank Accounts', 'asset', 'debit', (SELECT id FROM accounts WHERE code = '11'), TRUE),
  ('110104', 'المحافظ الإلكترونية وإنستاباي', 'E-Wallets & InstaPay', 'asset', 'debit', (SELECT id FROM accounts WHERE code = '11'), TRUE),

  -- العملاء والذمم المدينة (تحت 11)
  ('1102', 'العملاء والذمم المدينة', 'Accounts Receivable', 'asset', 'debit', (SELECT id FROM accounts WHERE code = '11'), TRUE),
  ('110201', 'عملاء الجملة والآجل', 'Wholesale Customers', 'asset', 'debit', (SELECT id FROM accounts WHERE code = '11'), TRUE),

  -- المخزون (تحت 11)
  ('1103', 'المخزون السلعي', 'Inventory Assets', 'asset', 'debit', (SELECT id FROM accounts WHERE code = '11'), TRUE),
  ('110301', 'مخزون البن والمنتجات التامة', 'Finished Goods Inventory', 'asset', 'debit', (SELECT id FROM accounts WHERE code = '11'), TRUE),
  ('110302', 'مخزون المواد الخام ومكونات الوصفات', 'Raw Materials Inventory', 'asset', 'debit', (SELECT id FROM accounts WHERE code = '11'), TRUE),

  -- الالتزامات المتداولة (تحت 21)
  ('2101', 'الموردون والذمم الدائنة', 'Accounts Payable', 'liability', 'credit', (SELECT id FROM accounts WHERE code = '21'), TRUE),
  ('210101', 'موردو البن والخامات', 'Coffee & Raw Material Suppliers', 'liability', 'credit', (SELECT id FROM accounts WHERE code = '21'), TRUE),
  ('2102', 'الضرائب المستحقة', 'Taxes Payable', 'liability', 'credit', (SELECT id FROM accounts WHERE code = '21'), TRUE),
  ('210201', 'أمانات ضريبة القيمة المضافة', 'VAT Payable', 'liability', 'credit', (SELECT id FROM accounts WHERE code = '21'), TRUE),
  ('2103', 'المستحقات ومصروفات الرواتب', 'Accrued Liabilities', 'liability', 'credit', (SELECT id FROM accounts WHERE code = '21'), TRUE),
  ('210301', 'الرواتب والأجور المستحقة', 'Accrued Payroll', 'liability', 'credit', (SELECT id FROM accounts WHERE code = '21'), TRUE),

  -- حقوق الملكية (تحت 31)
  ('3101', 'رأس المال', 'Capital', 'equity', 'credit', (SELECT id FROM accounts WHERE code = '31'), TRUE),
  ('3102', 'الأرباح المبقاة / المرحلة', 'Retained Earnings', 'equity', 'credit', (SELECT id FROM accounts WHERE code = '31'), TRUE),
  ('3103', 'جاري الشركاء والمسحوبات', 'Partner Accounts & Drawings', 'equity', 'credit', (SELECT id FROM accounts WHERE code = '31'), TRUE),

  -- الإيرادات (تحت 41 و 42)
  ('4101', 'إيرادات مبيعات الفروع والكاشير', 'POS Branch Sales Revenue', 'revenue', 'credit', (SELECT id FROM accounts WHERE code = '41'), TRUE),
  ('4102', 'إيرادات مبيعات الجملة', 'Wholesale Sales Revenue', 'revenue', 'credit', (SELECT id FROM accounts WHERE code = '41'), TRUE),
  ('4103', 'مردودات ومسموحات المبيعات', 'Sales Returns & Allowances', 'revenue', 'debit', (SELECT id FROM accounts WHERE code = '41'), TRUE),
  ('4201', 'فروقات وزيادات نقدية ومخزنية', 'Cash & Inventory Surpluses', 'revenue', 'credit', (SELECT id FROM accounts WHERE code = '42'), TRUE),

  -- المصروفات وتكلفة البضاعة (تحت 51 و 52)
  ('5101', 'تكلفة البضاعة المباعة - مبيعات الفروع', 'COGS - POS Sales', 'expense', 'debit', (SELECT id FROM accounts WHERE code = '51'), TRUE),
  ('5102', 'تكلفة البضاعة المباعة - مبيعات الجملة', 'COGS - Wholesale Sales', 'expense', 'debit', (SELECT id FROM accounts WHERE code = '51'), TRUE),
  ('5103', 'هدر وفواقد التشغيل والتصنيع', 'Operational Waste & Scrap', 'expense', 'debit', (SELECT id FROM accounts WHERE code = '51'), TRUE),
  ('5201', 'الرواتب والأجور والمكافآت', 'Salaries & Wages', 'expense', 'debit', (SELECT id FROM accounts WHERE code = '52'), TRUE),
  ('5202', 'الإيجارات والمرافق والخدمات', 'Rent & Utilities', 'expense', 'debit', (SELECT id FROM accounts WHERE code = '52'), TRUE),
  ('5203', 'الصيانة وقطع الغيار', 'Repairs & Maintenance', 'expense', 'debit', (SELECT id FROM accounts WHERE code = '52'), TRUE),
  ('5204', 'عجز النقدية وفروقات الجرد', 'Cash Shortage & Stock Deficit', 'expense', 'debit', (SELECT id FROM accounts WHERE code = '52'), TRUE),
  ('5205', 'مصروفات تشغيلية ونثرية عامة', 'General Operating Expenses', 'expense', 'debit', (SELECT id FROM accounts WHERE code = '52'), TRUE)
ON CONFLICT (code) DO NOTHING;

-- 9. صلاحيات النظام المحاسبي الجديد في جدول permissions
INSERT INTO permissions (code, name_ar, module)
VALUES
  ('accounting.view', 'عرض شجرة الحسابات ودفتر الأستاذ والتقارير المالية', 'accounting'),
  ('accounting.manage', 'إدارة الحسابات وإنشاء القيود اليدوية وإقفال الفترات', 'accounting'),
  ('purchase_returns.view', 'عرض مرتجعات المشتريات وإشعارات الخصم', 'purchases'),
  ('purchase_returns.create', 'تسجيل مرتجع مشتريات للمورد وخصم المخزون', 'purchases')
ON CONFLICT (code) DO UPDATE SET
  name_ar = EXCLUDED.name_ar,
  module = EXCLUDED.module;

-- ربط الصلاحيات الجديدة بالأدوار الإدارية
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name IN ('owner', 'admin', 'sys_admin', 'manager')
  AND p.code IN ('accounting.view', 'accounting.manage', 'purchase_returns.view', 'purchase_returns.create')
ON CONFLICT DO NOTHING;
