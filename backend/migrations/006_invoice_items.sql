-- بنود الفواتير اليدوية
CREATE TABLE IF NOT EXISTS invoice_items (
    id SERIAL PRIMARY KEY,
    invoice_id INT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    product_id INT REFERENCES products(id),
    description VARCHAR(255) NOT NULL,
    quantity DECIMAL(12,3) NOT NULL DEFAULT 1,
    unit_price DECIMAL(12,2) NOT NULL,
    discount_amount DECIMAL(12,2) DEFAULT 0,
    total_amount DECIMAL(12,2) NOT NULL,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_invoice_items_invoice ON invoice_items(invoice_id);

-- فواتير بدون بيع (يدوية)
ALTER TABLE invoices ALTER COLUMN sale_id DROP NOT NULL;
