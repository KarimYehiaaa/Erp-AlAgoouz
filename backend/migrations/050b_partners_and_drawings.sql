-- Migration: 050_partners_and_drawings.sql
-- Description: إنشاء جداول الشركاء، حسابات الجاري، وسندات مسحوبات الشركاء

CREATE TABLE IF NOT EXISTS partners (
  id SERIAL PRIMARY KEY,
  name_ar VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  share_percentage NUMERIC(5, 2) NOT NULL DEFAULT 0.00 CHECK (share_percentage >= 0 AND share_percentage <= 100),
  capital_contribution NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  opening_balance NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS partner_drawings (
  id SERIAL PRIMARY KEY,
  partner_id INTEGER NOT NULL REFERENCES partners(id) ON DELETE RESTRICT,
  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  drawing_date DATE NOT NULL DEFAULT CURRENT_DATE,
  source_type VARCHAR(50) NOT NULL DEFAULT 'cash_drawer', -- 'cash_drawer', 'main_treasury', 'bank_account'
  warehouse_id INTEGER REFERENCES warehouses(id) ON DELETE SET NULL,
  recipient_name VARCHAR(255),
  payment_method VARCHAR(50) DEFAULT 'cash',
  voucher_number VARCHAR(100),
  notes TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_partner_drawings_partner_id ON partner_drawings(partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_drawings_date ON partner_drawings(drawing_date DESC);
CREATE INDEX IF NOT EXISTS idx_partner_drawings_warehouse ON partner_drawings(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_partners_active ON partners(is_active);
