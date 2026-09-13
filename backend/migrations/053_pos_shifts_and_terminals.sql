-- ============================================================================
-- Migration 053: POS Terminals, Cashier Shifts, and Resilient Batch Syncing
-- Non-breaking additive migration for Desktop POS integration
-- ============================================================================

-- 1. جدول أجهزة ونقاط البيع بالفروع (POS Terminals)
CREATE TABLE IF NOT EXISTS pos_terminals (
    id SERIAL PRIMARY KEY,
    terminal_code VARCHAR(50) NOT NULL UNIQUE,
    name_ar VARCHAR(150) NOT NULL,
    warehouse_id INT NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
    device_fingerprint VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    last_sync_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pos_terminals_warehouse ON pos_terminals(warehouse_id);

-- 2. جدول ورديات الكاشير المالية (POS Cashier Shifts)
CREATE TABLE IF NOT EXISTS pos_shifts (
    id SERIAL PRIMARY KEY,
    shift_number VARCHAR(60) NOT NULL UNIQUE,
    terminal_id INT REFERENCES pos_terminals(id) ON DELETE SET NULL,
    warehouse_id INT NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
    cashier_user_id INT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    opening_cash DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    expected_cash DECIMAL(12,2) DEFAULT 0.00,
    actual_cash DECIMAL(12,2),
    cash_difference DECIMAL(12,2) DEFAULT 0.00,
    total_sales_amount DECIMAL(12,2) DEFAULT 0.00,
    total_cash_sales DECIMAL(12,2) DEFAULT 0.00,
    total_card_sales DECIMAL(12,2) DEFAULT 0.00,
    total_credit_sales DECIMAL(12,2) DEFAULT 0.00,
    total_refunds_amount DECIMAL(12,2) DEFAULT 0.00,
    status VARCHAR(30) NOT NULL DEFAULT 'open', -- 'open', 'closed', 'audited'
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pos_shifts_user ON pos_shifts(cashier_user_id);
CREATE INDEX IF NOT EXISTS idx_pos_shifts_warehouse ON pos_shifts(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_pos_shifts_status ON pos_shifts(status);

-- 3. جدول حركات النقدية داخل الوردية (Cash In / Cash Out / Drops)
CREATE TABLE IF NOT EXISTS pos_cash_movements (
    id SERIAL PRIMARY KEY,
    shift_id INT NOT NULL REFERENCES pos_shifts(id) ON DELETE CASCADE,
    movement_type VARCHAR(30) NOT NULL, -- 'drop' (توريد للخزينة), 'deposit' (إيداع فكة إضافية), 'expense' (مصروف طارئ)
    amount DECIMAL(12,2) NOT NULL,
    reason TEXT NOT NULL,
    authorized_by INT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pos_cash_movements_shift ON pos_cash_movements(shift_id);

-- 4. إضافة أعمدة الربط في جدول المبيعات دون التأثير على العمليات الحالية
ALTER TABLE sales ADD COLUMN IF NOT EXISTS terminal_id INT REFERENCES pos_terminals(id) ON DELETE SET NULL;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS pos_shift_id INT REFERENCES pos_shifts(id) ON DELETE SET NULL;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS offline_invoice_number VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_sales_pos_shift_id ON sales(pos_shift_id) WHERE pos_shift_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_terminal_id ON sales(terminal_id) WHERE terminal_id IS NOT NULL;

-- 5. إضافة جهاز افتراضي وفرع رئيسي للتهيئة التلقائية
INSERT INTO pos_terminals (terminal_code, name_ar, warehouse_id, is_active)
SELECT 'TRM-MAIN-01', 'نقطة بيع الفرع الرئيسي 1', id, TRUE
FROM warehouses
WHERE deleted_at IS NULL
ORDER BY id ASC
LIMIT 1
ON CONFLICT (terminal_code) DO NOTHING;
