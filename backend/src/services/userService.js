import bcrypt from 'bcryptjs';
import { query } from '../database/pool.js';
import { AppError } from '../middleware/errorHandler.js';
import { getOpeningBalance } from './openingBalanceService.js';

export const getUsers = async () =>
  (await query(
    `SELECT u.id, u.username, u.email, u.full_name, u.phone, u.is_active, u.last_login, u.created_at,
      r.name_ar as role_name, r.id as role_id FROM users u JOIN roles r ON u.role_id = r.id WHERE u.deleted_at IS NULL`
  )).rows;

export const createUser = async (data) => {
  const hash = await bcrypt.hash(data.password, 10);
  const result = await query(
    `INSERT INTO users (username, email, password_hash, full_name, phone, role_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, username, email, full_name, role_id`,
    [data.username, data.email, hash, data.full_name, data.phone, data.role_id]
  );
  return result.rows[0];
};

export const updateUser = async (id, data) => {
  let sql = `UPDATE users SET
    username=COALESCE(NULLIF($1, ''), username),
    full_name=COALESCE(NULLIF($2, ''), full_name),
    email=COALESCE(NULLIF($3, ''), email),
    phone=COALESCE(NULLIF($4, ''), phone),
    role_id=COALESCE($5, role_id),
    is_active=COALESCE($6, is_active)`;
  const params = [data.username, data.full_name, data.email, data.phone, data.role_id, data.is_active];
  if (data.password) {
    const hash = await bcrypt.hash(data.password, 10);
    sql += `, password_hash=$7`;
    params.push(hash);
  }
  params.push(id);
  sql += ` WHERE id=$${params.length} AND deleted_at IS NULL RETURNING id, username, full_name, role_id`;
  const result = await query(sql, params);
  if (!result.rows[0]) throw new AppError('المستخدم غير موجود', 404);
  return result.rows[0];
};

export const getRoles = async () => (await query(`SELECT * FROM roles WHERE deleted_at IS NULL`)).rows;

export const getNotifications = async (userId) =>
  (await query(`SELECT * FROM notifications WHERE user_id = $1 OR user_id IS NULL ORDER BY created_at DESC LIMIT 50`, [userId])).rows;

export const markNotificationRead = async (id) => {
  await query(`UPDATE notifications SET is_read = TRUE WHERE id = $1`, [id]);
};

export const getSettings = async () => {
  const result = await query(`SELECT key, value FROM settings`);
  return result.rows.reduce((acc, row) => { acc[row.key] = row.value; return acc; }, {});
};

export const updateSetting = async (key, value, userId) => {
  await query(`UPDATE settings SET value = $1::jsonb, updated_by = $2, updated_at = NOW() WHERE key = $3`, [JSON.stringify(value), userId, key]);
};

export const upsertSetting = async (key, value, userId, description = null) => {
  await query(
    `INSERT INTO settings (key, value, description, updated_by, updated_at)
     VALUES ($1, $2::jsonb, $3, $4, NOW())
     ON CONFLICT (key)
     DO UPDATE SET
       value = EXCLUDED.value,
       description = COALESCE(EXCLUDED.description, settings.description),
       updated_by = EXCLUDED.updated_by,
       updated_at = NOW()`,
    [key, JSON.stringify(value), description, userId]
  );
};

export const getSetting = async (key) => {
  const result = await query(`SELECT value FROM settings WHERE key = $1`, [key]);
  return result.rows[0]?.value ?? null;
};

const getSalesReport = async (filters = {}) => {
  const result = await query(
    `SELECT sale_date as date, sale_type, COUNT(*) as count,
            SUM(total_amount) as total, SUM(profit_amount) as profit,
            SUM(cost_amount) as cost
     FROM sales
     WHERE deleted_at IS NULL AND status = 'completed'
       AND ($1::date IS NULL OR sale_date >= $1)
       AND ($2::date IS NULL OR sale_date <= $2)
     GROUP BY sale_date, sale_type
     ORDER BY date DESC, sale_type`,
    [filters.from_date || null, filters.to_date || null]
  );
  return result.rows;
};

const getInventoryReport = async () => {
  const [stock, movements, warehouseValue] = await Promise.all([
    query(`SELECT * FROM v_product_stock ORDER BY total_quantity ASC`),
    query(
      `SELECT sm.movement_type, COUNT(*) as count, SUM(sm.quantity) as total_qty
       FROM stock_movements sm
       WHERE sm.created_at >= NOW() - INTERVAL '30 days'
       GROUP BY sm.movement_type`
    ),
    query(
      `SELECT w.name_ar as warehouse_name,
              COUNT(DISTINCT i.product_id) as products_count,
              COALESCE(SUM(i.quantity * p.purchase_price), 0) as total_value
       FROM inventory i
       JOIN warehouses w ON w.id = i.warehouse_id
       JOIN products p ON p.id = i.product_id
       WHERE p.deleted_at IS NULL
       GROUP BY w.id, w.name_ar
       ORDER BY total_value DESC`
    ),
  ]);
  return {
    products: stock.rows,
    movements: movements.rows,
    warehouseValue: warehouseValue.rows,
  };
};

const getProfitReport = async (filters = {}) => {
  const [daily, byCategory] = await Promise.all([
    query(
      `SELECT sale_date as date,
              SUM(total_amount) as revenue,
              SUM(cost_amount) as cost,
              SUM(profit_amount) as profit,
              CASE WHEN SUM(total_amount) > 0
                   THEN ROUND((SUM(profit_amount) / SUM(total_amount)) * 100, 1)
                   ELSE 0 END as margin_pct
       FROM sales
       WHERE deleted_at IS NULL AND status = 'completed'
         AND ($1::date IS NULL OR sale_date >= $1)
         AND ($2::date IS NULL OR sale_date <= $2)
       GROUP BY sale_date
       ORDER BY date DESC
       LIMIT 90`,
      [filters.from_date || null, filters.to_date || null]
    ),
    query(
      `SELECT pc.name_ar as category_name,
              COUNT(DISTINCT p.id) as products_count,
              COALESCE(SUM(si.quantity), 0) as total_qty,
              COALESCE(SUM(si.total_amount), 0) as total_revenue,
              COALESCE(SUM(si.quantity * p.purchase_price), 0) as total_cost,
              COALESCE(SUM(si.total_amount) - SUM(si.quantity * p.purchase_price), 0) as net_profit
       FROM products p
       LEFT JOIN product_categories pc ON pc.id = p.category_id
       LEFT JOIN sale_items si ON si.product_id = p.id
       LEFT JOIN sales s ON s.id = si.sale_id AND s.deleted_at IS NULL AND s.status = 'completed'
         AND ($1::date IS NULL OR s.sale_date >= $1)
         AND ($2::date IS NULL OR s.sale_date <= $2)
       WHERE p.deleted_at IS NULL
       GROUP BY pc.id, pc.name_ar
       ORDER BY net_profit DESC`,
      [filters.from_date || null, filters.to_date || null]
    ),
  ]);
  return { daily: daily.rows, byCategory: byCategory.rows };
};

const getExpensesReport = async (filters = {}) => {
  const [byCategory, monthly, recent] = await Promise.all([
    query(
      `SELECT COALESCE(ec.name_ar, '(/HF *5FJA') as category,
              COUNT(*) as count,
              SUM(e.amount) as total
       FROM expenses e
       LEFT JOIN expense_categories ec ON e.category_id = ec.id
       WHERE e.deleted_at IS NULL
         AND ($1::date IS NULL OR e.expense_date >= $1)
         AND ($2::date IS NULL OR e.expense_date <= $2)
       GROUP BY ec.name_ar
       ORDER BY total DESC`,
      [filters.from_date || null, filters.to_date || null]
    ),
    query(
      `SELECT TO_CHAR(expense_date, 'YYYY-MM') as month,
              COUNT(*) as count,
              SUM(amount) as total
       FROM expenses
       WHERE deleted_at IS NULL
         AND ($1::date IS NULL OR expense_date >= $1)
         AND ($2::date IS NULL OR expense_date <= $2)
       GROUP BY month
       ORDER BY month DESC
       LIMIT 12`,
      [filters.from_date || null, filters.to_date || null]
    ),
    query(
      `SELECT e.title, e.amount, e.expense_date,
              COALESCE(ec.name_ar, '(/HF *5FJA') as category
       FROM expenses e
       LEFT JOIN expense_categories ec ON e.category_id = ec.id
       WHERE e.deleted_at IS NULL
         AND ($1::date IS NULL OR e.expense_date >= $1)
         AND ($2::date IS NULL OR e.expense_date <= $2)
       ORDER BY e.expense_date DESC
       LIMIT 20`,
      [filters.from_date || null, filters.to_date || null]
    ),
  ]);
  return { byCategory: byCategory.rows, monthly: monthly.rows, recent: recent.rows };
};

const getPurchasesReport = async (filters = {}) => {
  const [summary, bySupplier, recent] = await Promise.all([
    query(
      `SELECT COUNT(*) as invoices_count,
              COALESCE(SUM(total_amount), 0) as total_amount,
              COALESCE(SUM(paid_amount), 0) as paid_amount,
              COALESCE(SUM(total_amount - paid_amount), 0) as unpaid_amount
       FROM supplier_invoices
       WHERE deleted_at IS NULL
         AND ($1::date IS NULL OR created_at::date >= $1)
         AND ($2::date IS NULL OR created_at::date <= $2)`,
      [filters.from_date || null, filters.to_date || null]
    ),
    query(
      `SELECT s.name_ar as supplier_name,
              COUNT(si.id) as invoices_count,
              COALESCE(SUM(si.total_amount), 0) as total_amount,
              COALESCE(SUM(si.paid_amount), 0) as paid_amount
       FROM suppliers s
       LEFT JOIN supplier_invoices si ON si.supplier_id = s.id AND si.deleted_at IS NULL
         AND ($1::date IS NULL OR si.created_at::date >= $1)
         AND ($2::date IS NULL OR si.created_at::date <= $2)
       WHERE s.deleted_at IS NULL
       GROUP BY s.id, s.name_ar
       ORDER BY total_amount DESC
       LIMIT 10`,
      [filters.from_date || null, filters.to_date || null]
    ),
    query(
      `SELECT si.invoice_number, si.total_amount, si.paid_amount,
              si.status, si.created_at, s.name_ar as supplier_name
       FROM supplier_invoices si
       JOIN suppliers s ON s.id = si.supplier_id
       WHERE si.deleted_at IS NULL
         AND ($1::date IS NULL OR si.created_at::date >= $1)
         AND ($2::date IS NULL OR si.created_at::date <= $2)
       ORDER BY si.created_at DESC
       LIMIT 20`,
      [filters.from_date || null, filters.to_date || null]
    ),
  ]);
  return { summary: summary.rows[0], bySupplier: bySupplier.rows, recent: recent.rows };
};

const getCustomersReport = async (filters = {}) => {
  const [topCustomers, unpaidInvoices, recentPayments] = await Promise.all([
    query(
      `SELECT c.name_ar, c.phone, c.customer_type,
              COUNT(s.id) as sales_count,
              COALESCE(SUM(s.total_amount), 0) as total_spent,
              c.balance
       FROM customers c
       LEFT JOIN sales s ON s.customer_id = c.id AND s.deleted_at IS NULL AND s.status = 'completed'
         AND ($1::date IS NULL OR s.sale_date >= $1)
         AND ($2::date IS NULL OR s.sale_date <= $2)
       WHERE c.deleted_at IS NULL AND c.is_active = TRUE
       GROUP BY c.id, c.name_ar, c.phone, c.customer_type, c.balance
       ORDER BY total_spent DESC
       LIMIT 15`,
      [filters.from_date || null, filters.to_date || null]
    ),
    query(
      `SELECT i.invoice_number, i.total_amount, i.payment_status,
              i.issued_at, c.name_ar as customer_name
       FROM invoices i
       LEFT JOIN customers c ON c.id = i.customer_id
       WHERE i.deleted_at IS NULL AND i.payment_status IN ('unpaid','partial')
       ORDER BY i.issued_at DESC
       LIMIT 15`
    ),
    query(
      `SELECT p.amount, p.payment_method, p.created_at,
              c.name_ar as customer_name
       FROM payments p
       LEFT JOIN customers c ON c.id = (
         SELECT customer_id FROM sales WHERE id = p.reference_id LIMIT 1
       )
       WHERE p.reference_type = 'sale'
       ORDER BY p.created_at DESC
       LIMIT 10`
    ),
  ]);
  return {
    topCustomers: topCustomers.rows,
    unpaidInvoices: unpaidInvoices.rows,
    recentPayments: recentPayments.rows,
  };
};

const getSystemSummary = async (filters = {}) => {
  const [sales, inventory, expenses, purchases, topProducts, lowStock, unpaidInvoices, customersCount] = await Promise.all([
    query(
      `SELECT COALESCE(SUM(total_amount),0) as total_sales,
              COALESCE(SUM(profit_amount),0) as total_profit,
              COUNT(*) as sales_count
       FROM sales
       WHERE deleted_at IS NULL
         AND status = 'completed'
         AND ($1::date IS NULL OR sale_date >= $1)
         AND ($2::date IS NULL OR sale_date <= $2)`,
      [filters.from_date || null, filters.to_date || null]
    ),
    query(
      `SELECT COUNT(DISTINCT product_id) as products,
              COALESCE(SUM(quantity),0) as total_qty,
              COUNT(DISTINCT warehouse_id) as warehouses
       FROM inventory`
    ),
    query(
      `SELECT COALESCE(SUM(amount),0) as total_expenses, COUNT(*) as expenses_count
       FROM expenses
       WHERE deleted_at IS NULL
         AND ($1::date IS NULL OR expense_date >= $1)
         AND ($2::date IS NULL OR expense_date <= $2)`,
      [filters.from_date || null, filters.to_date || null]
    ),
    query(
      `SELECT COALESCE(SUM(total_amount),0) as total_purchases,
              COUNT(*) as purchases_count
       FROM purchase_invoices
       WHERE deleted_at IS NULL
         AND ($1::date IS NULL OR invoice_date >= $1)
         AND ($2::date IS NULL OR invoice_date <= $2)`,
      [filters.from_date || null, filters.to_date || null]
    ),
    query(
      `SELECT p.name_ar, SUM(si.quantity) as qty, SUM(si.total_amount) as revenue
       FROM sale_items si
       JOIN sales s ON si.sale_id = s.id
       JOIN products p ON si.product_id = p.id
       WHERE s.deleted_at IS NULL AND s.status = 'completed'
       GROUP BY p.id, p.name_ar
       ORDER BY qty DESC
       LIMIT 5`
    ),
    query(`SELECT * FROM v_product_stock WHERE is_low_stock = TRUE ORDER BY total_quantity ASC LIMIT 10`),
    query(`SELECT COUNT(*) as count FROM invoices WHERE payment_status IN ('unpaid','partial') AND deleted_at IS NULL`),
    query(`SELECT COUNT(*) as count FROM customers WHERE deleted_at IS NULL AND is_active = TRUE`),
  ]);
  const openingBalance = filters.from_date && filters.to_date
    ? await getOpeningBalance(filters.from_date, filters.to_date)
    : { amount: 0 };

  return {
    sales: sales.rows[0],
    inventory: inventory.rows[0],
    expenses: expenses.rows[0],
    purchases: purchases.rows[0],
    openingBalance,
    topProducts: topProducts.rows,
    lowStock: lowStock.rows,
    unpaidInvoices: unpaidInvoices.rows[0],
    customersCount: parseInt(customersCount.rows[0]?.count || 0, 10),
    cashFlow: Number((
      Number(openingBalance.amount || 0) +
      Number(sales.rows[0]?.total_sales || 0) -
      Number(expenses.rows[0]?.total_expenses || 0) -
      Number(purchases.rows[0]?.total_purchases || 0)
    ).toFixed(2)),
  };
};

const normalizeReportType = (type) => {
  const value = String(type || 'summary').toLowerCase().trim();
  switch (value) {
    case 'report': case 'reports': case 'summary': case 'overview': case 'system':
      return 'summary';
    case 'sales': case 'sales-report': case 'sales_report':
      return 'sales';
    case 'inventory': case 'stock': case 'inventory-report': case 'inventory_report':
      return 'inventory';
    case 'profit': case 'profits': case 'profit-report': case 'profit_report':
      return 'profit';
    case 'expenses': case 'expense': case 'expense-report': case 'expense_report':
      return 'expenses';
    case 'purchases': case 'purchase': case 'purchases-report':
      return 'purchases';
    case 'customers': case 'customer': case 'customers-report':
      return 'customers';
    case 'all':
      return 'all';
    default:
      return value;
  }
};

export const getReports = async (type, filters = {}) => {
  switch (normalizeReportType(type)) {
    case 'sales':
      return getSalesReport(filters);
    case 'inventory':
      return getInventoryReport();
    case 'profit':
      return getProfitReport(filters);
    case 'expenses':
      return getExpensesReport(filters);
    case 'purchases':
      return getPurchasesReport(filters);
    case 'customers':
      return getCustomersReport(filters);
    case 'summary':
      return getSystemSummary(filters);
    case 'all':
      return {
        sales: await getSalesReport(filters),
        inventory: await getInventoryReport(),
        profit: await getProfitReport(filters),
        expenses: await getExpensesReport(filters),
        purchases: await getPurchasesReport(filters),
        customers: await getCustomersReport(filters),
        summary: await getSystemSummary(filters),
      };
    default:
      throw new AppError('نوع التقرير غير صالح', 400);
  }
};
