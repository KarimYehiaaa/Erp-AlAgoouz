-- بن العجوز ERP - Database Schema
-- PostgreSQL 14+

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============ ROLES & PERMISSIONS ============
CREATE TABLE roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    name_ar VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE permissions (
    id SERIAL PRIMARY KEY,
    code VARCHAR(100) NOT NULL UNIQUE,
    name_ar VARCHAR(150) NOT NULL,
    module VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE role_permissions (
    role_id INT REFERENCES roles(id) ON DELETE CASCADE,
    permission_id INT REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- ============ USERS ============
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    uuid UUID DEFAULT uuid_generate_v4() UNIQUE,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(150) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    phone VARCHAR(20),
    role_id INT REFERENCES roles(id),
    is_active BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMPTZ,
    avatar_url VARCHAR(500),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_users_role ON users(role_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_active ON users(is_active) WHERE deleted_at IS NULL;

-- ============ SETTINGS ============
CREATE TABLE settings (
    id SERIAL PRIMARY KEY,
    key VARCHAR(100) NOT NULL UNIQUE,
    value JSONB NOT NULL DEFAULT '{}',
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by INT REFERENCES users(id)
);

-- ============ WAREHOUSES ============
CREATE TABLE warehouses (
    id SERIAL PRIMARY KEY,
    code VARCHAR(20) NOT NULL UNIQUE,
    name_ar VARCHAR(150) NOT NULL,
    type VARCHAR(30) NOT NULL DEFAULT 'main', -- main, store, external
    address TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- ============ PRODUCT CATEGORIES ============
CREATE TABLE product_categories (
    id SERIAL PRIMARY KEY,
    name_ar VARCHAR(100) NOT NULL,
    slug VARCHAR(100) UNIQUE,
    parent_id INT REFERENCES product_categories(id),
    sort_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- ============ PRODUCTS ============
CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    sku VARCHAR(50) NOT NULL UNIQUE,
    barcode VARCHAR(50),
    name_ar VARCHAR(200) NOT NULL,
    description TEXT,
    category_id INT REFERENCES product_categories(id),
    unit VARCHAR(30) DEFAULT 'قطعة',
    purchase_price DECIMAL(12,2) DEFAULT 0,
    sale_price DECIMAL(12,2) NOT NULL DEFAULT 0,
    wholesale_price DECIMAL(12,2),
    min_stock INT DEFAULT 5,
    image_url VARCHAR(500),
    is_active BOOLEAN DEFAULT TRUE,
    track_expiry BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_products_category ON products(category_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_products_barcode ON products(barcode) WHERE barcode IS NOT NULL;

-- ============ INVENTORY ============
CREATE TABLE inventory (
    id SERIAL PRIMARY KEY,
    product_id INT NOT NULL REFERENCES products(id),
    warehouse_id INT NOT NULL REFERENCES warehouses(id),
    quantity DECIMAL(12,3) NOT NULL DEFAULT 0,
    reserved_quantity DECIMAL(12,3) DEFAULT 0,
    expiry_date DATE,
    batch_number VARCHAR(50),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_inventory_product_warehouse ON inventory (product_id, warehouse_id, COALESCE(batch_number, ''));

CREATE INDEX idx_inventory_product ON inventory(product_id);
CREATE INDEX idx_inventory_warehouse ON inventory(warehouse_id);
CREATE INDEX idx_inventory_low ON inventory(quantity) WHERE quantity >= 0;

-- ============ STOCK MOVEMENTS ============
CREATE TABLE stock_movements (
    id SERIAL PRIMARY KEY,
    uuid UUID DEFAULT uuid_generate_v4(),
    product_id INT NOT NULL REFERENCES products(id),
    from_warehouse_id INT REFERENCES warehouses(id),
    to_warehouse_id INT REFERENCES warehouses(id),
    movement_type VARCHAR(30) NOT NULL, -- in, out, transfer, adjustment, sale, return, purchase
    quantity DECIMAL(12,3) NOT NULL,
    reference_type VARCHAR(50),
    reference_id INT,
    notes TEXT,
    user_id INT REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_stock_movements_product ON stock_movements(product_id);
CREATE INDEX idx_stock_movements_date ON stock_movements(created_at);

-- ============ CUSTOMERS ============
CREATE TABLE customers (
    id SERIAL PRIMARY KEY,
    code VARCHAR(30) UNIQUE,
    name_ar VARCHAR(200) NOT NULL,
    phone VARCHAR(20),
    email VARCHAR(150),
    address TEXT,
    customer_type VARCHAR(20) DEFAULT 'retail', -- retail, wholesale
    credit_limit DECIMAL(12,2) DEFAULT 0,
    balance DECIMAL(12,2) DEFAULT 0,
    loyalty_points INT DEFAULT 0,
    tax_number VARCHAR(50),
    notes TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_customers_type ON customers(customer_type) WHERE deleted_at IS NULL;
CREATE INDEX idx_customers_phone ON customers(phone);

-- ============ SUPPLIERS ============
CREATE TABLE suppliers (
    id SERIAL PRIMARY KEY,
    code VARCHAR(30) UNIQUE,
    name_ar VARCHAR(200) NOT NULL,
    phone VARCHAR(20),
    email VARCHAR(150),
    address TEXT,
    balance DECIMAL(12,2) DEFAULT 0,
    notes TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- ============ SUPPLIER INVOICES ============
CREATE TABLE supplier_invoices (
    id SERIAL PRIMARY KEY,
    invoice_number VARCHAR(50) NOT NULL UNIQUE,
    supplier_id INT NOT NULL REFERENCES suppliers(id),
    total_amount DECIMAL(12,2) NOT NULL,
    paid_amount DECIMAL(12,2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'pending',
    due_date DATE,
    notes TEXT,
    user_id INT REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- ============ SALES ============
CREATE TABLE sales (
    id SERIAL PRIMARY KEY,
    sale_number VARCHAR(50) NOT NULL UNIQUE,
    sale_type VARCHAR(20) NOT NULL DEFAULT 'pos', -- pos, wholesale
    customer_id INT REFERENCES customers(id),
    warehouse_id INT NOT NULL REFERENCES warehouses(id),
    user_id INT NOT NULL REFERENCES users(id),
    subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
    discount_amount DECIMAL(12,2) DEFAULT 0,
    discount_percent DECIMAL(5,2) DEFAULT 0,
    tax_amount DECIMAL(12,2) DEFAULT 0,
    tax_percent DECIMAL(5,2) DEFAULT 15,
    total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    cost_amount DECIMAL(12,2) DEFAULT 0,
    profit_amount DECIMAL(12,2) DEFAULT 0,
    payment_status VARCHAR(20) DEFAULT 'paid', -- paid, partial, unpaid, refunded
    status VARCHAR(20) DEFAULT 'completed', -- draft, completed, cancelled, returned
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_sales_date ON sales(created_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_sales_customer ON sales(customer_id);
CREATE INDEX idx_sales_type ON sales(sale_type);

-- ============ SALE ITEMS ============
CREATE TABLE sale_items (
    id SERIAL PRIMARY KEY,
    sale_id INT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    product_id INT NOT NULL REFERENCES products(id),
    quantity DECIMAL(12,3) NOT NULL,
    unit_price DECIMAL(12,2) NOT NULL,
    cost_price DECIMAL(12,2) DEFAULT 0,
    discount_amount DECIMAL(12,2) DEFAULT 0,
    tax_amount DECIMAL(12,2) DEFAULT 0,
    total_amount DECIMAL(12,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sale_items_sale ON sale_items(sale_id);

-- ============ INVOICES ============
CREATE TABLE invoices (
    id SERIAL PRIMARY KEY,
    invoice_number VARCHAR(50) NOT NULL UNIQUE,
    sale_id INT REFERENCES sales(id),
    customer_id INT REFERENCES customers(id),
    invoice_type VARCHAR(20) DEFAULT 'sale',
    subtotal DECIMAL(12,2) NOT NULL,
    discount_amount DECIMAL(12,2) DEFAULT 0,
    tax_amount DECIMAL(12,2) DEFAULT 0,
    total_amount DECIMAL(12,2) NOT NULL,
    payment_status VARCHAR(20) DEFAULT 'paid',
    qr_data TEXT,
    pdf_path VARCHAR(500),
    issued_at TIMESTAMPTZ DEFAULT NOW(),
    due_date DATE,
    notes TEXT,
    user_id INT REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_invoices_sale ON invoices(sale_id);
CREATE INDEX idx_invoices_status ON invoices(payment_status);

-- ============ PAYMENTS ============
CREATE TABLE payments (
    id SERIAL PRIMARY KEY,
    payment_number VARCHAR(50) UNIQUE,
    reference_type VARCHAR(30) NOT NULL, -- sale, invoice, supplier, expense
    reference_id INT NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    payment_method VARCHAR(30) NOT NULL, -- cash, card, transfer, credit
    notes TEXT,
    user_id INT REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_payments_reference ON payments(reference_type, reference_id);

-- ============ EXPENSE CATEGORIES ============
CREATE TABLE expense_categories (
    id SERIAL PRIMARY KEY,
    name_ar VARCHAR(100) NOT NULL,
    slug VARCHAR(50) UNIQUE,
    is_active BOOLEAN DEFAULT TRUE
);

-- ============ EXPENSES ============
CREATE TABLE expenses (
    id SERIAL PRIMARY KEY,
    expense_number VARCHAR(50) UNIQUE,
    category_id INT REFERENCES expense_categories(id),
    title VARCHAR(200) NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    payment_method VARCHAR(30) DEFAULT 'cash',
    recurring BOOLEAN DEFAULT FALSE,
    notes TEXT,
    user_id INT REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_expenses_date ON expenses(expense_date) WHERE deleted_at IS NULL;
CREATE INDEX idx_expenses_category ON expenses(category_id);

-- ============ NOTIFICATIONS ============
CREATE TABLE notifications (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id),
    type VARCHAR(50) NOT NULL,
    title_ar VARCHAR(200) NOT NULL,
    message_ar TEXT,
    data JSONB DEFAULT '{}',
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id, is_read);

-- ============ AUDIT LOGS ============
CREATE TABLE audit_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id),
    action VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id INT,
    old_data JSONB,
    new_data JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_date ON audit_logs(created_at);

-- ============ ACTIVITY LOGS ============
CREATE TABLE activity_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id),
    module VARCHAR(50) NOT NULL,
    action_ar VARCHAR(200) NOT NULL,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============ VIEWS ============
CREATE OR REPLACE VIEW v_product_stock AS
SELECT 
    p.id AS product_id,
    p.sku,
    p.name_ar,
    p.min_stock,
    p.sale_price,
    p.purchase_price,
    pc.name_ar AS category_name,
    COALESCE(SUM(i.quantity), 0) AS total_quantity,
    CASE WHEN COALESCE(SUM(i.quantity), 0) <= p.min_stock THEN TRUE ELSE FALSE END AS is_low_stock
FROM products p
LEFT JOIN product_categories pc ON p.category_id = pc.id
LEFT JOIN inventory i ON p.id = i.product_id
WHERE p.deleted_at IS NULL AND p.is_active = TRUE
GROUP BY p.id, pc.name_ar;

CREATE OR REPLACE VIEW v_daily_sales AS
SELECT 
    DATE(created_at) AS sale_date,
    COUNT(*) AS sales_count,
    SUM(total_amount) AS total_sales,
    SUM(profit_amount) AS total_profit,
    SUM(cost_amount) AS total_cost
FROM sales
WHERE deleted_at IS NULL AND status = 'completed'
GROUP BY DATE(created_at);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_users_updated BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_products_updated BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_customers_updated BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_sales_updated BEFORE UPDATE ON sales FOR EACH ROW EXECUTE FUNCTION update_updated_at();
