-- =====================================================
-- Migration 011: جداول المشتريات
-- =====================================================

CREATE TABLE IF NOT EXISTS purchase_invoices (
  id SERIAL PRIMARY KEY,
  invoice_number VARCHAR(50) NOT NULL UNIQUE,
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  warehouse_id INT NOT NULL REFERENCES warehouses(id),
  notes TEXT,
  subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS purchase_invoice_items (
  id SERIAL PRIMARY KEY,
  purchase_invoice_id INT NOT NULL REFERENCES purchase_invoices(id) ON DELETE CASCADE,
  product_id INT NOT NULL REFERENCES products(id),
  warehouse_id INT REFERENCES warehouses(id),
  unit VARCHAR(30) NOT NULL DEFAULT 'count',
  quantity DECIMAL(12,3) NOT NULL,
  unit_price DECIMAL(12,2) NOT NULL,
  total_amount DECIMAL(12,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
