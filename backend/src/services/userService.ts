import bcrypt from 'bcryptjs';
import { query, getClient } from '../database/pool.ts';
import { AppError } from '../types/errors.ts';
import { getOpeningBalance } from './openingBalanceService.ts';
import { encrypt } from '../utils/crypto.ts';
import { clearWarehouseCache } from '../middleware/branchIsolation.ts';
const getUsers = async () =>
  (
    await query(
      `SELECT u.id, u.username, u.email, u.full_name, u.phone, u.is_active, u.last_login, u.created_at,
      r.name_ar as role_name, r.id as role_id FROM users u JOIN roles r ON u.role_id = r.id WHERE u.deleted_at IS NULL`,
    )
  ).rows;
const createUser = async (data) => {
  const hash = await bcrypt.hash(data.password, 10);
  const result = await query(
    `INSERT INTO users (username, email, password_hash, full_name, phone, role_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, username, email, full_name, role_id`,
    [data.username, data.email, hash, data.full_name, data.phone, data.role_id],
  );
  return result.rows[0];
};
const updateUser = async (id, data) => {
  let sql = `UPDATE users SET
    username=COALESCE(NULLIF($1, ''), username),
    full_name=COALESCE(NULLIF($2, ''), full_name),
    email=COALESCE(NULLIF($3, ''), email),
    phone=COALESCE(NULLIF($4, ''), phone),
    role_id=COALESCE($5, role_id),
    is_active=COALESCE($6, is_active)`;
  const params = [
    data.username,
    data.full_name,
    data.email,
    data.phone,
    data.role_id,
    data.is_active,
  ];
  if (data.password) {
    const hash = await bcrypt.hash(data.password, 10);
    sql += `, password_hash=$7, password_changed_at=NOW()`;
    params.push(hash);
  }
  // تغيير كلمة المرور أو الدور يبطل توكنات الوصول الحالية فوراً (وليس refresh فقط)
  if (data.password || data.role_id !== undefined) {
    sql += `, token_version = COALESCE(token_version, 0) + 1`;
  }
  params.push(id);
  sql += ` WHERE id=$${params.length} AND deleted_at IS NULL RETURNING id, username, full_name, role_id`;
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await client.query(sql, params);
    if (!result.rows[0])
      throw new AppError(
        '\u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F',
        404,
      );
    if (data.password || data.role_id !== undefined) {
      await client.query(`UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1`, [id]);
    }
    await client.query('COMMIT');
    // تغيير الدور/التفعيل يؤثر على المخازن المسموحة — مسح كاش العزل فوراً
    if (data.role_id !== undefined || data.is_active !== undefined) {
      clearWarehouseCache(id);
    }
    return result.rows[0];
  } catch (err: any) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};
const getRoles = async () =>
  (await query(`SELECT * FROM roles WHERE deleted_at IS NULL ORDER BY id ASC`)).rows;
const createRole = async (data) => {
  const existing = await query(`SELECT id FROM roles WHERE name = $1 AND deleted_at IS NULL`, [
    data.name,
  ]);
  if (existing.rows.length)
    throw new AppError(
      '\u064A\u0648\u062C\u062F \u0645\u0646\u0635\u0628 \u0628\u0647\u0630\u0627 \u0627\u0644\u0627\u0633\u0645 \u0628\u0627\u0644\u0641\u0639\u0644',
      400,
    );
  const result = await query(
    `INSERT INTO roles (name, name_ar, description) VALUES ($1, $2, $3) RETURNING *`,
    [data.name.toLowerCase().replace(/\s+/g, '_'), data.name_ar, data.description || null],
  );
  return result.rows[0];
};
const updateRole = async (id, data) => {
  const existing = await query(`SELECT name FROM roles WHERE id = $1 AND deleted_at IS NULL`, [id]);
  if (!existing.rows[0])
    throw new AppError(
      '\u0627\u0644\u0645\u0646\u0635\u0628 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F',
      404,
    );
  if (existing.rows[0].name === 'admin')
    throw new AppError(
      '\u0644\u0627 \u064A\u0645\u0643\u0646 \u062A\u0639\u062F\u064A\u0644 \u0645\u0646\u0635\u0628 \u0645\u062F\u064A\u0631 \u0627\u0644\u0646\u0638\u0627\u0645',
      400,
    );
  const result = await query(
    `UPDATE roles SET name_ar = COALESCE($1, name_ar), description = COALESCE($2, description), updated_at = NOW() WHERE id = $3 AND deleted_at IS NULL RETURNING *`,
    [data.name_ar, data.description, id],
  );
  return result.rows[0];
};
const deleteRole = async (id) => {
  const existing = await query(`SELECT name FROM roles WHERE id = $1 AND deleted_at IS NULL`, [id]);
  if (!existing.rows[0])
    throw new AppError(
      '\u0627\u0644\u0645\u0646\u0635\u0628 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F',
      404,
    );
  if (existing.rows[0].name === 'admin')
    throw new AppError(
      '\u0644\u0627 \u064A\u0645\u0643\u0646 \u062D\u0630\u0641 \u0645\u0646\u0635\u0628 \u0645\u062F\u064A\u0631 \u0627\u0644\u0646\u0638\u0627\u0645',
      400,
    );
  const users = await query(
    `SELECT COUNT(*) FROM users WHERE role_id = $1 AND deleted_at IS NULL`,
    [id],
  );
  if (parseInt(users.rows[0].count) > 0)
    throw new AppError(
      '\u0644\u0627 \u064A\u0645\u0643\u0646 \u062D\u0630\u0641 \u0645\u0646\u0635\u0628 \u0645\u0631\u062A\u0628\u0637 \u0628\u0645\u0633\u062A\u062E\u062F\u0645\u064A\u0646. \u064A\u0631\u062C\u0649 \u062A\u063A\u064A\u064A\u0631 \u0645\u0646\u0635\u0628 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645\u064A\u0646 \u0623\u0648\u0644\u0627\u064B',
      400,
    );
  await query(`UPDATE roles SET deleted_at = NOW() WHERE id = $1`, [id]);
  return { success: true };
};
const getNotifications = async (userId) =>
  (
    await query(
      `SELECT * FROM notifications WHERE user_id = $1 OR user_id IS NULL ORDER BY created_at DESC LIMIT 50`,
      [userId],
    )
  ).rows;
const markNotificationRead = async (id) => {
  await query(`UPDATE notifications SET is_read = TRUE WHERE id = $1`, [id]);
};
const markAllNotificationsRead = async (userId) => {
  const res = await query(
    `UPDATE notifications SET is_read = TRUE WHERE is_read = FALSE AND (user_id = $1 OR user_id IS NULL)`,
    [userId],
  );
  return { updated: res.rowCount || 0 };
};
const SENSITIVE_KEYS = [
  'gdrive_key',
  'dropbox_token',
  'gdrive_client_secret',
  'gdrive_refresh_token',
];
const getSettings = async () => {
  const result = await query(`SELECT key, value FROM settings`);
  return result.rows.reduce((acc, row) => {
    const val = row.value;
    if (row.key === 'cloud_backup' && val) {
      SENSITIVE_KEYS.forEach((k) => {
        if (val[k]) val[k] = '*REDACTED*';
      });
    }
    acc[row.key] = val;
    return acc;
  }, {});
};
const updateSetting = async (key, value, userId) => {
  const finalValue = { ...value };
  if (key === 'cloud_backup') {
    const current = (await getSetting('cloud_backup')) || {};
    SENSITIVE_KEYS.forEach((k) => {
      if (finalValue[k] === '*REDACTED*') {
        finalValue[k] = current[k] || '';
      } else if (finalValue[k]) {
        finalValue[k] = encrypt(finalValue[k]);
      }
    });
  }
  await query(
    `UPDATE settings SET value = $1::jsonb, updated_by = $2, updated_at = NOW() WHERE key = $3`,
    [JSON.stringify(finalValue), userId, key],
  );
};
const upsertSetting = async (
  key: string,
  value: any,
  userId: any,
  description: string | null = null,
) => {
  const finalValue = { ...value };
  if (key === 'cloud_backup') {
    const current = (await getSetting('cloud_backup')) || {};
    SENSITIVE_KEYS.forEach((k) => {
      if (finalValue[k] === '*REDACTED*') {
        finalValue[k] = current[k] || '';
      } else if (finalValue[k]) {
        finalValue[k] = encrypt(finalValue[k]);
      }
    });
  }
  await query(
    `INSERT INTO settings (key, value, description, updated_by, updated_at)
     VALUES ($1, $2::jsonb, $3, $4, NOW())
     ON CONFLICT (key)
     DO UPDATE SET
       value = EXCLUDED.value,
       description = COALESCE(EXCLUDED.description, settings.description),
       updated_by = EXCLUDED.updated_by,
       updated_at = NOW()`,
    [key, JSON.stringify(finalValue), description, userId],
  );
};
const getSetting = async (key) => {
  const result = await query(`SELECT value FROM settings WHERE key = $1`, [key]);
  return result.rows[0]?.value ?? null;
};
const getSalesReport = async (filters: Record<string, any> = {}) => {
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
    [filters.from_date || null, filters.to_date || null],
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
       GROUP BY sm.movement_type`,
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
       ORDER BY total_value DESC`,
    ),
  ]);
  return {
    products: stock.rows,
    movements: movements.rows,
    warehouseValue: warehouseValue.rows,
  };
};
const getProfitReport = async (filters: Record<string, any> = {}) => {
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
      [filters.from_date || null, filters.to_date || null],
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
       LEFT JOIN (
         SELECT si_inner.product_id, si_inner.quantity, si_inner.total_amount
         FROM sale_items si_inner
         JOIN sales s ON s.id = si_inner.sale_id
         WHERE s.deleted_at IS NULL
           AND s.status = 'completed'
           AND ($1::date IS NULL OR s.sale_date >= $1)
           AND ($2::date IS NULL OR s.sale_date <= $2)
       ) si ON si.product_id = p.id
       WHERE p.deleted_at IS NULL
       GROUP BY pc.id, pc.name_ar
       ORDER BY net_profit DESC`,
      [filters.from_date || null, filters.to_date || null],
    ),
  ]);
  return { daily: daily.rows, byCategory: byCategory.rows };
};
const getExpensesReport = async (filters: Record<string, any> = {}) => {
  const [byCategory, monthly, recent] = await Promise.all([
    query(
      `SELECT COALESCE(ec.name_ar, '\u063A\u064A\u0631 \u0645\u0635\u0646\u0641') as category,
              COUNT(*) as count,
              SUM(e.amount) as total
       FROM expenses e
       LEFT JOIN expense_categories ec ON e.category_id = ec.id
       WHERE e.deleted_at IS NULL
         AND ($1::date IS NULL OR e.expense_date >= $1)
         AND ($2::date IS NULL OR e.expense_date <= $2)
       GROUP BY ec.name_ar
       ORDER BY total DESC`,
      [filters.from_date || null, filters.to_date || null],
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
      [filters.from_date || null, filters.to_date || null],
    ),
    query(
      `SELECT e.title, e.amount, e.expense_date,
              COALESCE(ec.name_ar, '\u063A\u064A\u0631 \u0645\u0635\u0646\u0641') as category
       FROM expenses e
       LEFT JOIN expense_categories ec ON e.category_id = ec.id
       WHERE e.deleted_at IS NULL
         AND ($1::date IS NULL OR e.expense_date >= $1)
         AND ($2::date IS NULL OR e.expense_date <= $2)
       ORDER BY e.expense_date DESC
       LIMIT 20`,
      [filters.from_date || null, filters.to_date || null],
    ),
  ]);
  return { byCategory: byCategory.rows, monthly: monthly.rows, recent: recent.rows };
};
const getPurchasesReport = async (filters: Record<string, any> = {}) => {
  const [summary, bySupplier, recent] = await Promise.all([
    query(
      `SELECT COUNT(*)::int as invoices_count,
              COALESCE(SUM(total_amount), 0) as total_amount,
              COALESCE((SELECT SUM(amount) FROM payments WHERE reference_type = 'supplier' AND ($1::date IS NULL OR created_at::date >= $1) AND ($2::date IS NULL OR created_at::date <= $2)), 0) as paid_amount
       FROM purchase_invoices
       WHERE deleted_at IS NULL
         AND ($1::date IS NULL OR invoice_date >= $1)
         AND ($2::date IS NULL OR invoice_date <= $2)`,
      [filters.from_date || null, filters.to_date || null],
    ),
    query(
      `SELECT s.name_ar as supplier_name,
              COUNT(pi.id)::int as invoices_count,
              COALESCE(SUM(pi.total_amount), 0) as total_amount,
              COALESCE((SELECT SUM(amount) FROM payments WHERE reference_type = 'supplier' AND reference_id = s.id AND ($1::date IS NULL OR created_at::date >= $1) AND ($2::date IS NULL OR created_at::date <= $2)), 0) as paid_amount
       FROM suppliers s
       LEFT JOIN purchase_invoices pi ON pi.supplier_id = s.id AND pi.deleted_at IS NULL
         AND ($1::date IS NULL OR pi.invoice_date >= $1)
         AND ($2::date IS NULL OR pi.invoice_date <= $2)
       WHERE s.deleted_at IS NULL
       GROUP BY s.id, s.name_ar
       ORDER BY total_amount DESC
       LIMIT 10`,
      [filters.from_date || null, filters.to_date || null],
    ),
    query(
      `SELECT pi.invoice_number, pi.total_amount,
              CASE
                WHEN s.balance <= 0 THEN 'paid'
                WHEN (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE reference_type = 'supplier' AND reference_id = pi.supplier_id) > 0 THEN 'partial'
                ELSE 'pending'
              END as status,
              pi.invoice_date as created_at, s.name_ar as supplier_name
       FROM purchase_invoices pi
       JOIN suppliers s ON s.id = pi.supplier_id
       WHERE pi.deleted_at IS NULL
         AND ($1::date IS NULL OR pi.invoice_date >= $1)
         AND ($2::date IS NULL OR pi.invoice_date <= $2)
       ORDER BY pi.invoice_date DESC, pi.id DESC
       LIMIT 20`,
      [filters.from_date || null, filters.to_date || null],
    ),
  ]);
  const total_amount = Number(summary.rows[0]?.total_amount || 0);
  const paid_amount = Number(summary.rows[0]?.paid_amount || 0);
  const unpaid_amount = Math.max(0, total_amount - paid_amount);
  return {
    summary: {
      invoices_count: summary.rows[0]?.invoices_count || 0,
      total_amount,
      paid_amount,
      unpaid_amount,
    },
    bySupplier: bySupplier.rows.map((r) => ({
      ...r,
      total_amount: Number(r.total_amount),
      paid_amount: Number(r.paid_amount),
    })),
    recent: recent.rows.map((r) => ({
      ...r,
      total_amount: Number(r.total_amount),
    })),
  };
};
const getWastageReport = async (filters: Record<string, any> = {}) => {
  const result = await query(
    `SELECT 
       p.id,
       p.name_ar as name,
       p.unit,
       pc.name_ar as category,
       COALESCE(SUM(CASE WHEN sm.movement_type = 'consumption' THEN sm.quantity ELSE 0 END), 0)::numeric as theoretical_consumption,
       COALESCE(SUM(CASE WHEN sm.movement_type = 'adjustment' AND sm.from_warehouse_id IS NOT NULL AND sm.to_warehouse_id IS NULL THEN sm.quantity ELSE 0 END), 0)::numeric as actual_waste
     FROM products p
     LEFT JOIN product_categories pc ON p.category_id = pc.id
     LEFT JOIN stock_movements sm ON p.id = sm.product_id 
       AND ($1::date IS NULL OR sm.created_at::date >= $1)
       AND ($2::date IS NULL OR sm.created_at::date <= $2)
     WHERE p.deleted_at IS NULL
     GROUP BY p.id, p.name_ar, p.unit, pc.name_ar
     HAVING 
       SUM(CASE WHEN sm.movement_type = 'consumption' THEN sm.quantity ELSE 0 END) > 0 
       OR SUM(CASE WHEN sm.movement_type = 'adjustment' AND sm.from_warehouse_id IS NOT NULL AND sm.to_warehouse_id IS NULL THEN sm.quantity ELSE 0 END) > 0
     ORDER BY actual_waste DESC`,
    [filters.from_date || null, filters.to_date || null],
  );
  return result.rows.map((row) => ({
    ...row,
    theoretical_consumption: Number(row.theoretical_consumption),
    actual_waste: Number(row.actual_waste),
  }));
};
const getCustomersReport = async (filters: Record<string, any> = {}) => {
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
      [filters.from_date || null, filters.to_date || null],
    ),
    query(
      `SELECT i.invoice_number, i.total_amount, i.payment_status,
              i.issued_at, c.name_ar as customer_name
       FROM invoices i
       JOIN sales s ON s.id = i.sale_id
       LEFT JOIN customers c ON c.id = i.customer_id
       WHERE i.deleted_at IS NULL
         AND i.payment_status IN ('unpaid','partial')
         AND s.sale_type = 'wholesale'
         AND s.deleted_at IS NULL
       ORDER BY i.issued_at DESC
       LIMIT 15`,
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
       LIMIT 10`,
    ),
  ]);
  return {
    topCustomers: topCustomers.rows,
    unpaidInvoices: unpaidInvoices.rows,
    recentPayments: recentPayments.rows,
  };
};
const getSystemSummary = async (filters: Record<string, any> = {}) => {
  const [
    sales,
    inventory,
    expenses,
    purchases,
    topProducts,
    lowStock,
    unpaidInvoices,
    customersCount,
  ] = await Promise.all([
    query(
      `SELECT COALESCE(SUM(total_amount),0) as total_sales,
              COALESCE(SUM(profit_amount),0) as total_profit,
              COUNT(*) as sales_count
       FROM sales
       WHERE deleted_at IS NULL
         AND status = 'completed'
         AND ($1::date IS NULL OR sale_date >= $1)
         AND ($2::date IS NULL OR sale_date <= $2)`,
      [filters.from_date || null, filters.to_date || null],
    ),
    query(
      `SELECT COUNT(DISTINCT product_id) as products,
              COALESCE(SUM(quantity),0) as total_qty,
              COUNT(DISTINCT warehouse_id) as warehouses
       FROM inventory`,
    ),
    query(
      `SELECT COALESCE(SUM(amount),0) as total_expenses, COUNT(*) as expenses_count
       FROM expenses
       WHERE deleted_at IS NULL
         AND ($1::date IS NULL OR expense_date >= $1)
         AND ($2::date IS NULL OR expense_date <= $2)`,
      [filters.from_date || null, filters.to_date || null],
    ),
    query(
      `SELECT COALESCE(SUM(total_amount),0) as total_purchases,
              COUNT(*) as purchases_count
       FROM purchase_invoices
       WHERE deleted_at IS NULL
         AND ($1::date IS NULL OR invoice_date >= $1)
         AND ($2::date IS NULL OR invoice_date <= $2)`,
      [filters.from_date || null, filters.to_date || null],
    ),
    query(
      `SELECT p.name_ar, SUM(si.quantity) as qty, SUM(si.total_amount) as revenue
       FROM sale_items si
       JOIN sales s ON si.sale_id = s.id
       JOIN products p ON si.product_id = p.id
       WHERE s.deleted_at IS NULL AND s.status = 'completed'
       GROUP BY p.id, p.name_ar
       ORDER BY qty DESC
       LIMIT 5`,
    ),
    query(
      `SELECT * FROM v_product_stock WHERE is_low_stock = TRUE ORDER BY total_quantity ASC LIMIT 10`,
    ),
    query(
      `SELECT COUNT(*)::int as count FROM invoices i JOIN sales s ON s.id = i.sale_id WHERE i.payment_status IN ('unpaid','partial') AND s.sale_type = 'wholesale' AND i.deleted_at IS NULL AND s.deleted_at IS NULL`,
    ),
    query(`SELECT COUNT(*) as count FROM customers WHERE deleted_at IS NULL AND is_active = TRUE`),
  ]);
  const openingBalance =
    filters.from_date && filters.to_date
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
    cashFlow: Number(
      (
        Number(openingBalance.amount || 0) +
        Number(sales.rows[0]?.total_sales || 0) -
        Number(expenses.rows[0]?.total_expenses || 0) -
        Number(purchases.rows[0]?.total_purchases || 0)
      ).toFixed(2),
    ),
  };
};
const normalizeReportType = (type) => {
  const value = String(type || 'summary')
    .toLowerCase()
    .trim();
  switch (value) {
    case 'report':
    case 'reports':
    case 'summary':
    case 'overview':
    case 'system':
      return 'summary';
    case 'sales':
    case 'sales-report':
    case 'sales_report':
      return 'sales';
    case 'inventory':
    case 'stock':
    case 'inventory-report':
    case 'inventory_report':
      return 'inventory';
    case 'profit':
    case 'profits':
    case 'profit-report':
    case 'profit_report':
      return 'profit';
    case 'expenses':
    case 'expense':
    case 'expense-report':
    case 'expense_report':
      return 'expenses';
    case 'purchases':
    case 'purchase':
    case 'purchases-report':
      return 'purchases';
    case 'customers':
    case 'customer':
    case 'customers-report':
      return 'customers';
    case 'wastage':
    case 'waste':
    case 'wastage-report':
    case 'wastage_report':
      return 'wastage';
    case 'all':
      return 'all';
    default:
      return value;
  }
};
const getReports = async (type, filters: Record<string, any> = {}) => {
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
    case 'wastage':
      return getWastageReport(filters);
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
        wastage: await getWastageReport(filters),
        summary: await getSystemSummary(filters),
      };
    default:
      throw new AppError(
        '\u0646\u0648\u0639 \u0627\u0644\u062A\u0642\u0631\u064A\u0631 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D',
        400,
      );
  }
};
const deleteUser = async (id, currentUserId) => {
  if (Number(id) === Number(currentUserId)) {
    throw new AppError(
      '\u0644\u0627 \u064A\u0645\u0643\u0646 \u062D\u0630\u0641 \u062D\u0633\u0627\u0628\u0643 \u0627\u0644\u062D\u0627\u0644\u064A \u0627\u0644\u0630\u064A \u062A\u0633\u062A\u062E\u062F\u0645\u0647 \u0644\u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644',
      400,
    );
  }
  const result = await query(
    `UPDATE users SET deleted_at = NOW(), is_active = FALSE WHERE id = $1 AND deleted_at IS NULL RETURNING id, username`,
    [id],
  );
  if (!result.rows[0])
    throw new AppError(
      '\u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F',
      404,
    );
  return result.rows[0];
};
const getPermissions = async () =>
  (await query(`SELECT * FROM permissions ORDER BY module, name_ar`)).rows;
const getRolePermissions = async (roleId) =>
  (await query(`SELECT permission_id FROM role_permissions WHERE role_id = $1`, [roleId])).rows.map(
    (r) => r.permission_id,
  );
const updateRolePermissions = async (roleId, permissionIds) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM role_permissions WHERE role_id = $1`, [roleId]);
    if (permissionIds && permissionIds.length > 0) {
      const values: any[] = [];
      const placeholders: any[] = [];
      permissionIds.forEach((permId, idx) => {
        values.push(roleId, permId);
        placeholders.push(`($${idx * 2 + 1}, $${idx * 2 + 2})`);
      });
      const sql = `INSERT INTO role_permissions (role_id, permission_id) VALUES ${placeholders.join(', ')}`;
      await client.query(sql, values);
    }
    await client.query('COMMIT');
    return { success: true };
  } catch (err: any) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};
export {
  createRole,
  createUser,
  deleteRole,
  deleteUser,
  getNotifications,
  getPermissions,
  getReports,
  getRolePermissions,
  getRoles,
  getSetting,
  getSettings,
  getUsers,
  markNotificationRead,
  markAllNotificationsRead,
  updateRole,
  updateRolePermissions,
  updateSetting,
  updateUser,
  upsertSetting,
};
