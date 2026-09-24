-- Seed Data - بن العجوز ERP

-- Roles
INSERT INTO roles (name, name_ar, description) VALUES
('admin', 'مدير النظام', 'صلاحيات كاملة'),
('manager', 'مدير', 'إدارة وتقارير'),
('cashier', 'كاشير', 'مبيعات المحل'),
('warehouse', 'موظف مخزن', 'إدارة المخزون');

-- Permissions
INSERT INTO permissions (code, name_ar, module) VALUES
('dashboard.view', 'عرض لوحة التحكم', 'dashboard'),
('sales.wholesale', 'مبيعات الجملة', 'sales'),
('sales.return', 'مرتجعات المبيعات', 'sales'),
('products.manage', 'إدارة المنتجات', 'products'),
('inventory.manage', 'إدارة المخزون', 'inventory'),
('customers.manage', 'إدارة العملاء', 'customers'),
('suppliers.manage', 'إدارة الموردين', 'suppliers'),
('invoices.manage', 'إدارة الفواتير', 'invoices'),
('expenses.manage', 'إدارة المصروفات', 'expenses'),
('reports.view', 'عرض التقارير', 'reports'),
('users.manage', 'إدارة المستخدمين', 'users'),
('settings.manage', 'إعدادات النظام', 'settings');

-- Admin gets all permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT 1, id FROM permissions;

-- Manager permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT 2, id FROM permissions WHERE code NOT IN ('users.manage', 'settings.manage');

-- Cashier permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT 3, id FROM permissions WHERE code IN ('dashboard.view', 'sales.wholesale', 'sales.return', 'customers.manage', 'invoices.manage');

-- Warehouse permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT 4, id FROM permissions WHERE module IN ('inventory', 'products') OR code = 'dashboard.view';

-- Default admin user (KarimYehia) — bcrypt hash for original password
INSERT INTO users (username, email, password_hash, full_name, phone, role_id) VALUES
('KarimYehia', 'capo.unlimited@gmail.com', '$2a$10$TD5OatzzB43t5DNHSAu0g.lldONWx21D58yiG3pwK5lsRZv1L6Kk6', 'بن العجوز', '01142819808', 1);

-- Warehouses
INSERT INTO warehouses (code, name_ar, type, address) VALUES
('MAIN', 'المخزن الرئيسي', 'main', 'المخزن الخلفي'),
('STORE', 'محل البيع', 'store', 'واجهة المحل');

-- Categories
INSERT INTO product_categories (name_ar, slug, sort_order) VALUES
('بن تركي', 'turkish-coffee', 1),
('قهوة فرنسية', 'french-coffee', 2),
('هوت شوكليت', 'hot-chocolate', 3),
('نسكافيه', 'nescafe', 4),
('مشروبات باردة', 'cold-drinks', 5),
('إضافات', 'addons', 6);

-- Products
INSERT INTO products (sku, barcode, name_ar, category_id, unit, purchase_price, sale_price, wholesale_price, min_stock) VALUES
('TC-001', '6281001000001', 'بن تركي - 250 جرام', 1, 'كيس', 45.00, 65.00, 58.00, 10),
('TC-002', '6281001000002', 'بن تركي - 500 جرام', 1, 'كيس', 85.00, 120.00, 105.00, 8),
('TC-003', '6281001000003', 'بن تركي - 1 كيلو', 1, 'كيس', 160.00, 220.00, 195.00, 5),
('FC-001', '6281001000011', 'قهوة فرنسية - 250 جرام', 2, 'كيس', 40.00, 58.00, 52.00, 10),
('FC-002', '6281001000012', 'قهوة فرنسية - 500 جرام', 2, 'كيس', 75.00, 105.00, 95.00, 8),
('HC-001', '6281001000021', 'هوت شوكليت - علبة', 3, 'علبة', 25.00, 38.00, 34.00, 15),
('NS-001', '6281001000031', 'نسكافيه كلاسيك', 4, 'علبة', 30.00, 45.00, 40.00, 12),
('NS-002', '6281001000032', 'نسكافيه 3 في 1', 4, 'علبة', 35.00, 52.00, 47.00, 12),
('CD-001', '6281001000041', 'عصير برتقال - علبة', 5, 'علبة', 8.00, 12.00, 10.00, 20),
('CD-002', '6281001000042', 'مياه معدنية', 5, 'زجاجة', 1.50, 3.00, 2.50, 50),
('AD-001', '6281001000051', 'سكر - كيس', 6, 'كيس', 5.00, 8.00, 7.00, 20),
('AD-002', '6281001000052', 'حليب مكثف', 6, 'علبة', 12.00, 18.00, 16.00, 15);

-- Initial inventory
INSERT INTO inventory (product_id, warehouse_id, quantity)
SELECT p.id, 1, 
    CASE p.sku 
        WHEN 'TC-001' THEN 50 WHEN 'TC-002' THEN 35 WHEN 'TC-003' THEN 20
        WHEN 'FC-001' THEN 40 WHEN 'FC-002' THEN 30
        WHEN 'HC-001' THEN 60 WHEN 'NS-001' THEN 45 WHEN 'NS-002' THEN 40
        WHEN 'CD-001' THEN 80 WHEN 'CD-002' THEN 200
        WHEN 'AD-001' THEN 100 WHEN 'AD-002' THEN 55
        ELSE 25
    END
FROM products p;

INSERT INTO inventory (product_id, warehouse_id, quantity)
SELECT p.id, 2, 
    CASE p.sku 
        WHEN 'TC-001' THEN 15 WHEN 'TC-002' THEN 10 WHEN 'TC-003' THEN 5
        WHEN 'FC-001' THEN 12 WHEN 'FC-002' THEN 8
        WHEN 'HC-001' THEN 20 WHEN 'NS-001' THEN 15 WHEN 'NS-002' THEN 12
        WHEN 'CD-001' THEN 30 WHEN 'CD-002' THEN 60
        WHEN 'AD-001' THEN 25 WHEN 'AD-002' THEN 18
        ELSE 10
    END
FROM products p;

-- Expense categories
INSERT INTO expense_categories (name_ar, slug) VALUES
('إيجار', 'rent'),
('كهرباء', 'electricity'),
('مرتبات', 'salaries'),
('خامات', 'raw-materials'),
('صيانة', 'maintenance'),
('فواتير', 'bills'),
('مصروفات يومية', 'daily'),
('أخرى', 'other');

-- Sample customers
INSERT INTO customers (code, name_ar, phone, customer_type, credit_limit) VALUES
('C-001', 'عميل نقدي', NULL, 'retail', 0),
('C-002', 'محمد الأحمد', '0551234567', 'wholesale', 5000),
('C-003', 'مؤسسة القهوة الذهبية', '0559876543', 'wholesale', 15000),
('C-004', 'سارة العتيبي', '0541112233', 'retail', 0);

-- Sample supplier
INSERT INTO suppliers (code, name_ar, phone) VALUES
('S-001', 'مورد البن التركي', '0112345678'),
('S-002', 'شركة المشروبات المتحدة', '0118765432');

-- Settings
INSERT INTO settings (key, value, description) VALUES
('company', '{"name_ar":"بن العجوز","phone":"01000000000","address":"جمهورية مصر العربية","country":"مصر","currency":"EGP","currency_symbol":"ج.م","tax_number":"","logo":"/logo.png"}', 'بيانات الشركة'),
('tax', '{"enabled":true,"rate":14}', 'إعدادات الضريبة (مصر)'),
('invoice', '{"prefix":"INV","next_number":1001}', 'إعدادات الفواتير'),
('sale', '{"prefix":"SL","next_number":1001}', 'إعدادات المبيعات'),
('theme', '{"default":"light"}', 'إعدادات المظهر');
