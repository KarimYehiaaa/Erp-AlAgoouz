-- Migration: Advanced RBAC (034_advanced_rbac.sql)

-- (المعامل الخارجي يديره مشغل الهجرات)
-- 1. Update existing roles names to match the new structure (ONLY ARABIC names to avoid trigger errors)
UPDATE roles SET name_ar = 'مالك', description = 'صلاحيات كاملة وغير قابلة للتعديل' WHERE id = 1;
UPDATE roles SET name_ar = 'مدير فرع', description = 'إدارة فرع' WHERE id = 2;
UPDATE roles SET name_ar = 'كاشير', description = 'كاشير' WHERE id = 3;
UPDATE roles SET name_ar = 'امين مستودع', description = 'إدارة المخزون' WHERE id = 4;

-- Ensure "sys_admin" (مدير نظام) exists as a separate role if it doesn't already
INSERT INTO roles (name, name_ar, description)
SELECT 'sys_admin', 'مدير نظام', 'إدارة النظام بشكل عام'
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'sys_admin');

-- 2. Clear old permissions
DELETE FROM role_permissions;
DELETE FROM permissions;

-- 3. Insert new matrix permissions
INSERT INTO permissions (code, name_ar, module) VALUES
-- Dashboard
('dashboard.view', 'عرض الرئيسية', 'dashboard'),
('dashboard.add', 'إضافة للرئيسية', 'dashboard'),
('dashboard.edit', 'تعديل الرئيسية', 'dashboard'),
('dashboard.delete', 'حذف من الرئيسية', 'dashboard'),
-- POS
('pos.view', 'عرض شاشة البيع', 'pos'),
('pos.add', 'إضافة بيع', 'pos'),
('pos.edit', 'تعديل بيع', 'pos'),
('pos.delete', 'حذف بيع', 'pos'),
-- Products
('products.view', 'عرض المنتجات', 'products'),
('products.add', 'إضافة منتجات', 'products'),
('products.edit', 'تعديل منتجات', 'products'),
('products.delete', 'حذف منتجات', 'products'),
-- Inventory
('inventory.view', 'عرض حركة المخزن', 'inventory'),
('inventory.add', 'إضافة حركة مخزن', 'inventory'),
('inventory.edit', 'تعديل حركة مخزن', 'inventory'),
('inventory.delete', 'حذف حركة مخزن', 'inventory'),
-- Customers
('customers.view', 'عرض العملاء', 'customers'),
('customers.add', 'إضافة عملاء', 'customers'),
('customers.edit', 'تعديل عملاء', 'customers'),
('customers.delete', 'حذف عملاء', 'customers'),
-- Suppliers
('suppliers.view', 'عرض الموردين', 'suppliers'),
('suppliers.add', 'إضافة موردين', 'suppliers'),
('suppliers.edit', 'تعديل موردين', 'suppliers'),
('suppliers.delete', 'حذف موردين', 'suppliers'),
-- Reports
('reports.view', 'عرض التقارير', 'reports'),
('reports.add', 'إضافة تقارير', 'reports'),
('reports.edit', 'تعديل تقارير', 'reports'),
('reports.delete', 'حذف تقارير', 'reports'),
-- Invoices
('invoices.view', 'عرض الفواتير', 'invoices'),
('invoices.add', 'إضافة فواتير', 'invoices'),
('invoices.edit', 'تعديل فواتير', 'invoices'),
('invoices.delete', 'حذف فواتير', 'invoices'),
-- Expenses
('expenses.view', 'عرض المصروفات', 'expenses'),
('expenses.add', 'إضافة مصروفات', 'expenses'),
('expenses.edit', 'تعديل مصروفات', 'expenses'),
('expenses.delete', 'حذف مصروفات', 'expenses'),
-- Settings
('settings.view', 'عرض الإعدادات', 'settings'),
('settings.add', 'إضافة للإعدادات', 'settings'),
('settings.edit', 'تعديل الإعدادات', 'settings'),
('settings.delete', 'حذف الإعدادات', 'settings'),
-- Shifts
('shifts.view', 'عرض الوردية', 'shifts'),
('shifts.add', 'إضافة وردية', 'shifts'),
('shifts.edit', 'تعديل وردية', 'shifts'),
('shifts.delete', 'حذف وردية', 'shifts'),
-- Users
('users.view', 'عرض المستخدمين', 'users'),
('users.add', 'إضافة مستخدمين', 'users'),
('users.edit', 'تعديل مستخدمين', 'users'),
('users.delete', 'حذف مستخدمين', 'users'),
-- Promotions
('promotions.view', 'عرض العروض الترويجية', 'promotions'),
('promotions.add', 'إضافة عروض', 'promotions'),
('promotions.edit', 'تعديل عروض', 'promotions'),
('promotions.delete', 'حذف عروض', 'promotions');

-- 4. Re-assign basic default permissions
-- Owner (ID 1) gets everything
INSERT INTO role_permissions (role_id, permission_id)
SELECT 1, id FROM permissions;

-- Admin gets almost everything except maybe delete settings/users
INSERT INTO role_permissions (role_id, permission_id)
SELECT roles.id, p.id 
FROM roles 
CROSS JOIN permissions p
WHERE roles.name = 'sys_admin';

-- Branch Manager
INSERT INTO role_permissions (role_id, permission_id)
SELECT roles.id, p.id 
FROM roles 
CROSS JOIN permissions p
WHERE roles.name = 'manager'
AND p.module NOT IN ('settings');

-- Cashier (POS view/add, customers view/add, shifts view)
INSERT INTO role_permissions (role_id, permission_id)
SELECT roles.id, p.id 
FROM roles 
CROSS JOIN permissions p
WHERE roles.name = 'cashier'
AND p.code IN (
    'pos.view', 'pos.add', 
    'customers.view', 'customers.add',
    'shifts.view', 'shifts.add', 'shifts.edit'
);

-- Warehouse (Inventory, Products)
INSERT INTO role_permissions (role_id, permission_id)
SELECT roles.id, p.id 
FROM roles 
CROSS JOIN permissions p
WHERE roles.name = 'warehouse'
AND p.module IN ('inventory', 'products');

