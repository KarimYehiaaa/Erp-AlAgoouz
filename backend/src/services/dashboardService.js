import { query } from '../database/pool.js';
import { getOpeningBalanceForDate } from './openingBalanceService.js';
import { appCache } from '../utils/cache.js';

const toNumber = (value) => Number(value || 0);
const roundMoney = (value) => Math.round(toNumber(value) * 100) / 100;
const formatDate = (date) => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const parseDate = (value, fallback) => {
  if (!value) return fallback;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
};

const getPeriod = (filters = {}) => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const range = filters.range || 'month';
  let start;
  let end = today;

  if (range === 'today') {
    start = today;
  } else if (range === 'week') {
    start = addDays(today, -6);
  } else if (range === 'year') {
    start = new Date(today.getFullYear(), 0, 1);
  } else if (range === 'custom') {
    start = parseDate(filters.from_date, new Date(today.getFullYear(), today.getMonth(), 1));
    end = parseDate(filters.to_date, today);
    if (start > end) [start, end] = [end, start];
  } else {
    start = new Date(today.getFullYear(), today.getMonth(), 1);
  }

  const days = Math.max(1, Math.round((end - start) / 86400000) + 1);
  const grouping = days > 90 ? 'month' : 'day';
  const previousEnd = addDays(start, -1);
  const previousStart = addDays(previousEnd, -(days - 1));

  return {
    range,
    today: formatDate(today),
    start: formatDate(start),
    end: formatDate(end),
    previousStart: formatDate(previousStart),
    previousEnd: formatDate(previousEnd),
    days,
    grouping,
  };
};

const getMonthPeriod = (date) => {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return { start: formatDate(start), end: formatDate(end) };
};

const pctChange = (current, previous) => {
  const curr = toNumber(current);
  const prev = toNumber(previous);
  if (prev === 0) return curr > 0 ? 100 : 0;
  return roundMoney(((curr - prev) / Math.abs(prev)) * 100);
};

// BUG-09 FIX: Cache بسيط في الذاكرة لـ 60 ثانية
// يمنع تشغيل 30+ query على كل تحميل للـ Dashboard
const DASHBOARD_CACHE_TTL = 60 * 1000; // 60 ثانية
const _dashboardCache = new Map();

const _getCached = (key) => {
  const entry = _dashboardCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > DASHBOARD_CACHE_TTL) {
    _dashboardCache.delete(key);
    return null;
  }
  return entry.data;
};

const _setCached = (key, data) => {
  if (_dashboardCache.size >= 100) {
    const firstKey = _dashboardCache.keys().next().value;
    if (firstKey) _dashboardCache.delete(firstKey);
  }
  _dashboardCache.set(key, { data, at: Date.now() });
};

// استدعاء هذه الدالة من أي مكان لمسح الـ cache (مثلاً بعد حفظ بيع جديد)
let _lastInvalidated = 0;
export const invalidateDashboardCache = () => {
  const now = Date.now();
  if (now - _lastInvalidated > 30000) { // بحد أقصى مرة واحدة كل 30 ثانية
    _dashboardCache.clear();
    appCache.invalidateByTag('pl_report');
    appCache.invalidateByTag('product_cost');
    _lastInvalidated = now;
  }
};

const _computeDashboardStats = async (filters = {}) => {
  const period = getPeriod(filters);
  const grouping = period.grouping || 'day';
  const interval = grouping === 'month' ? '1 month' : '1 day';
  const salesJoin = grouping === 'month'
    ? "date_trunc('month', s.sale_date) = date_trunc('month', d::date)"
    : "s.sale_date = d::date";
  const expenseJoin = grouping === 'month'
    ? "date_trunc('month', e.expense_date) = date_trunc('month', d::date)"
    : "e.expense_date = d::date";

  // BUG FIX: استخدام التاريخ الحالي للخادم كالشهر الحالي بدلاً من MAX(month_date) لمنع تداخل الشهور أو بقاء لوحة التحكم عالقة في الشهر السابق عند بدء شهر جديد.
  const currentMonthDate = new Date();
  const currentMonth = getMonthPeriod(currentMonthDate);

  // تقسيم الـ queries إلى مجموعتين لتجنب استنزاف الـ connection pool
  // (كانت 33 query متوازية دفعة واحدة، الآن مقسّمة على بatchين)
  const [
    currentMonthSalesByType,
    currentMonthExpenses,
    currentMonthPurchases,
    todaySales,
    todayExpenses,
    periodSales,
    periodExpenses,
    periodPurchases,
    previousSales,
    previousExpenses,
    previousPurchases,
    todayPurchases,
    salesByType,
    paymentSummary,
    unpaidInvoices,
    customersCount,
  ] = await Promise.all([
    query(
      `SELECT sale_type,
              COALESCE(SUM(total_amount),0) AS total,
              COUNT(*)::int AS count
       FROM sales
       WHERE sale_date BETWEEN $1::date AND $2::date
         AND deleted_at IS NULL
         AND status = 'completed'
       GROUP BY sale_type`,
      [currentMonth.start, currentMonth.end]
    ),
    query(
      `SELECT COALESCE(SUM(amount),0) AS total, COUNT(*)::int AS count
       FROM expenses
       WHERE expense_date BETWEEN $1::date AND $2::date AND deleted_at IS NULL`,
      [currentMonth.start, currentMonth.end]
    ),
    query(
      `SELECT COALESCE(SUM(total_amount),0) AS total, COUNT(*)::int AS count
       FROM purchase_invoices
       WHERE invoice_date BETWEEN $1::date AND $2::date
         AND deleted_at IS NULL`,
      [currentMonth.start, currentMonth.end]
    ),
    query(
      `SELECT COALESCE(SUM(total_amount),0) AS total,
              COALESCE(SUM(profit_amount),0) AS profit,
              COALESCE(SUM(cost_amount),0) AS cost,
              COUNT(*)::int AS count
       FROM sales
       WHERE sale_date = $1::date AND deleted_at IS NULL AND status = 'completed'`,
      [period.today]
    ),
    query(
      `SELECT COALESCE(SUM(amount),0) AS total, COUNT(*)::int AS count
       FROM expenses
       WHERE expense_date = $1::date AND deleted_at IS NULL`,
      [period.today]
    ),
    query(
      `SELECT COALESCE(SUM(total_amount),0) AS total,
              COALESCE(SUM(profit_amount),0) AS gross_profit,
              COALESCE(SUM(cost_amount),0) AS cost,
              COUNT(*)::int AS count
       FROM sales
       WHERE sale_date BETWEEN $1::date AND $2::date AND deleted_at IS NULL AND status = 'completed'`,
      [period.start, period.end]
    ),
    query(
      `SELECT COALESCE(SUM(amount),0) AS total, COUNT(*)::int AS count
       FROM expenses
       WHERE expense_date BETWEEN $1::date AND $2::date AND deleted_at IS NULL`,
      [period.start, period.end]
    ),
    query(
      `SELECT COALESCE(SUM(total_amount),0) AS total, COUNT(*)::int AS count
       FROM purchase_invoices
       WHERE invoice_date BETWEEN $1::date AND $2::date
         AND deleted_at IS NULL`,
      [period.start, period.end]
    ),
    query(
      `SELECT COALESCE(SUM(total_amount),0) AS total,
              COALESCE(SUM(cost_amount),0) AS cost,
              COALESCE(SUM(profit_amount),0) AS gross_profit,
              COUNT(*)::int AS count
       FROM sales
       WHERE sale_date BETWEEN $1::date AND $2::date AND deleted_at IS NULL AND status = 'completed'`,
      [period.previousStart, period.previousEnd]
    ),
    query(
      `SELECT COALESCE(SUM(amount),0) AS total, COUNT(*)::int AS count
       FROM expenses
       WHERE expense_date BETWEEN $1::date AND $2::date AND deleted_at IS NULL`,
      [period.previousStart, period.previousEnd]
    ),
    query(
      `SELECT COALESCE(SUM(total_amount),0) AS total, COUNT(*)::int AS count
       FROM purchase_invoices
       WHERE invoice_date BETWEEN $1::date AND $2::date
         AND deleted_at IS NULL`,
      [period.previousStart, period.previousEnd]
    ),
    query(
      `SELECT COALESCE(SUM(total_amount),0) AS total, COUNT(*)::int AS count
       FROM purchase_invoices
       WHERE invoice_date = $1::date
         AND deleted_at IS NULL`,
      [period.today]
    ),
    query(
      `SELECT sale_type,
              COALESCE(SUM(total_amount),0) AS total,
              COALESCE(SUM(profit_amount),0) AS profit,
              COUNT(*)::int AS count
       FROM sales
       WHERE sale_date BETWEEN $1::date AND $2::date AND deleted_at IS NULL AND status = 'completed'
       GROUP BY sale_type
       ORDER BY total DESC`,
      [period.start, period.end]
    ),
    query(
      `SELECT payment_status,
              COALESCE(SUM(total_amount),0) AS total,
              COUNT(*)::int AS count
       FROM sales
       WHERE sale_date BETWEEN $1::date AND $2::date AND deleted_at IS NULL AND status = 'completed'
       GROUP BY payment_status`,
      [period.start, period.end]
    ),
    query(
      `SELECT COUNT(*)::int AS count,
              COALESCE(SUM(
                GREATEST(0, i.total_amount - COALESCE((
                  SELECT SUM(amount)
                  FROM payments
                  WHERE reference_type = 'sale' AND reference_id = i.sale_id
                ), 0))
              ), 0) AS amount
       FROM invoices i
       JOIN sales s ON s.id = i.sale_id
       WHERE i.payment_status IN ('unpaid','partial')
         AND s.sale_type = 'wholesale'
         AND i.deleted_at IS NULL
         AND s.deleted_at IS NULL`
    ),
    query(`SELECT COUNT(*)::int AS count FROM customers WHERE deleted_at IS NULL AND is_active = TRUE`),
  ]);

  // Batch 2: inventory + charts (queries مستقلة عن السياق الزمني في معظمها)
  const [
    inventoryStats,
    stockAlerts,
    lowStock,
    topProducts,
    recentSales,
    recentActivity,
    salesTrend,
    expenseTrend,
    expenseByCategory,
    inventoryChart,
  ] = await Promise.all([
    query(
      // إصلاح: كانت تستثني منتجات الوصفات من قيمة المخزون (تعارض مع migration 017
      // الذي أعاد إدراجها في v_product_stock). الآن تحسب جميع المنتجات النشطة.
      `WITH layer_values AS (
         SELECT product_id, warehouse_id, SUM(remaining_quantity * unit_cost) AS value
         FROM inventory_cost_layers
         GROUP BY product_id, warehouse_id
       )
       SELECT COUNT(DISTINCT i.product_id)::int AS products,
              COALESCE(SUM(i.quantity),0) AS total_qty,
              COALESCE(SUM(COALESCE(lv.value, i.quantity * COALESCE(p.purchase_price, 0))),0) AS inventory_value,
              COUNT(DISTINCT i.warehouse_id)::int AS warehouses
       FROM inventory i
       JOIN products p ON p.id = i.product_id
       LEFT JOIN layer_values lv ON lv.product_id = i.product_id AND lv.warehouse_id = i.warehouse_id
       WHERE p.deleted_at IS NULL`
    ),
    query(`SELECT COUNT(*)::int AS count FROM v_product_stock WHERE is_low_stock = TRUE`),
    query(`SELECT * FROM v_product_stock WHERE is_low_stock = TRUE ORDER BY total_quantity ASC LIMIT 8`),
    query(
      `SELECT p.id, p.name_ar, p.sku,
              COALESCE(SUM(si.quantity),0) AS qty,
              COALESCE(SUM(si.total_amount),0) AS revenue,
              COALESCE(SUM(si.total_amount - si.cost_price),0) AS profit
       FROM sale_items si
       JOIN sales s ON si.sale_id = s.id
       JOIN products p ON si.product_id = p.id
       WHERE s.sale_date BETWEEN $1::date AND $2::date AND s.deleted_at IS NULL AND s.status = 'completed'
       GROUP BY p.id, p.name_ar, p.sku
       ORDER BY revenue DESC
       LIMIT 8`,
      [period.start, period.end]
    ),
    query(
      `SELECT s.id, s.sale_number, s.sale_type, s.sale_date, s.total_amount, s.profit_amount,
              s.payment_status, c.name_ar AS customer_name
       FROM sales s
       LEFT JOIN customers c ON c.id = s.customer_id
       WHERE s.deleted_at IS NULL
       ORDER BY s.created_at DESC
       LIMIT 8`
    ),
    query(
      `SELECT al.action_ar, al.module, al.created_at, u.full_name
       FROM activity_logs al
       LEFT JOIN users u ON al.user_id = u.id
       ORDER BY al.created_at DESC
       LIMIT 10`
    ),
    query(
      `SELECT date_trunc('${grouping}', d)::date AS date,
              COALESCE(SUM(s.total_amount),0) AS sales,
              COALESCE(SUM(s.profit_amount),0) AS profit,
              COUNT(s.id)::int AS count
       FROM generate_series($1::date, $2::date, INTERVAL '${interval}') d
       LEFT JOIN sales s ON ${salesJoin} AND s.deleted_at IS NULL AND s.status = 'completed'
       GROUP BY date_trunc('${grouping}', d)::date
       ORDER BY date`,
      [period.start, period.end]
    ),
    query(
      `SELECT date_trunc('${grouping}', d)::date AS date, COALESCE(SUM(e.amount),0) AS expenses
       FROM generate_series($1::date, $2::date, INTERVAL '${interval}') d
       LEFT JOIN expenses e ON ${expenseJoin} AND e.deleted_at IS NULL
       GROUP BY date_trunc('${grouping}', d)::date
       ORDER BY date`,
      [period.start, period.end]
    ),
    query(
      `SELECT COALESCE(ec.name_ar, ':J1 E5FA') AS name_ar,
              COALESCE(SUM(e.amount),0) AS total,
              COUNT(e.id)::int AS count
       FROM expenses e
       LEFT JOIN expense_categories ec ON ec.id = e.category_id
       WHERE e.expense_date BETWEEN $1::date AND $2::date AND e.deleted_at IS NULL
       GROUP BY ec.id, ec.name_ar
       ORDER BY total DESC
       LIMIT 6`,
      [period.start, period.end]
    ),
    query(
      // إصلاح: توحيد مع inventoryStats — إزالة استثناء منتجات الوصفات
      `WITH layer_values AS (
         SELECT product_id, warehouse_id, SUM(remaining_quantity * unit_cost) AS value
         FROM inventory_cost_layers
         GROUP BY product_id, warehouse_id
       )
       SELECT p.name_ar, COALESCE(SUM(i.quantity),0) AS qty,
              COALESCE(SUM(COALESCE(lv.value, i.quantity * COALESCE(p.purchase_price, 0))),0) AS value
       FROM inventory i
       JOIN products p ON i.product_id = p.id
       LEFT JOIN layer_values lv ON lv.product_id = i.product_id AND lv.warehouse_id = i.warehouse_id
       WHERE p.deleted_at IS NULL
       GROUP BY p.id, p.name_ar
       ORDER BY value DESC
       LIMIT 10`
    ),
  ]);

  // Batch 3: supplier/recipe/payment summaries
  const [
    stockByWarehouse,
    topCustomers,
    recipeSummary,
    recipeCostChart,
    recipeAlerts,
    purchaseSummary,
    supplierSummary,
    categoryProfitability,
    paymentMethodSummary,
    stockMovementSummary,
    peakHours,
  ] = await Promise.all([
    query(
      `WITH layer_values AS (
         SELECT product_id, warehouse_id, SUM(remaining_quantity * unit_cost) AS value
         FROM inventory_cost_layers
         GROUP BY product_id, warehouse_id
       )
       SELECT w.id, w.name_ar,
              COUNT(DISTINCT i.product_id)::int AS products,
              COALESCE(SUM(i.quantity),0) AS qty,
              COALESCE(SUM(COALESCE(lv.value, i.quantity * COALESCE(p.purchase_price, 0))),0) AS value
       FROM warehouses w
       LEFT JOIN inventory i ON i.warehouse_id = w.id
       LEFT JOIN products p ON p.id = i.product_id AND p.deleted_at IS NULL
       LEFT JOIN layer_values lv ON lv.product_id = i.product_id AND lv.warehouse_id = i.warehouse_id
       WHERE w.deleted_at IS NULL
       GROUP BY w.id, w.name_ar
       ORDER BY value DESC`
    ),
    query(
      `SELECT c.id, c.name_ar, c.phone,
              COALESCE(SUM(s.total_amount),0) AS total_spent,
              COALESCE(SUM(s.profit_amount),0) AS profit,
              COUNT(s.id)::int AS sales_count
       FROM customers c
       JOIN sales s ON s.customer_id = c.id
       WHERE s.sale_date BETWEEN $1::date AND $2::date
         AND s.deleted_at IS NULL
         AND s.status = 'completed'
         AND c.deleted_at IS NULL
       GROUP BY c.id, c.name_ar, c.phone
       ORDER BY total_spent DESC
       LIMIT 8`,
      [period.start, period.end]
    ),
    query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE is_active = TRUE AND deleted_at IS NULL)::int AS active,
              COALESCE(SUM(item_counts.items_count),0)::int AS ingredients,
              COUNT(*) FILTER (
                WHERE is_active = TRUE
                  AND deleted_at IS NULL
                  AND EXISTS (
                    SELECT 1
                    FROM product_recipe_items pri
                    LEFT JOIN inventory inv ON inv.product_id = pri.ingredient_product_id
                    WHERE pri.recipe_id = product_recipes.id
                    GROUP BY pri.id, pri.quantity
                    HAVING COALESCE(SUM(inv.quantity),0) < pri.quantity
                  )
              )::int AS shortage_recipes
       FROM product_recipes
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS items_count
         FROM product_recipe_items
         WHERE recipe_id = product_recipes.id
       ) item_counts ON TRUE`
    ),
    query(
      `SELECT r.id, r.name_ar, p.name_ar AS product_name,
              COUNT(ri.id)::int AS ingredients_count,
              COALESCE(SUM(ri.quantity * COALESCE(ip.purchase_price,0)),0) AS estimated_cost,
              COALESCE(SUM(si.quantity),0) AS sold_qty,
              COALESCE(SUM(si.total_amount),0) AS revenue
       FROM product_recipes r
       JOIN products p ON p.id = r.product_id
       LEFT JOIN product_recipe_items ri ON ri.recipe_id = r.id
       LEFT JOIN products ip ON ip.id = ri.ingredient_product_id
       LEFT JOIN sale_items si ON si.product_id = r.product_id
       LEFT JOIN sales s ON s.id = si.sale_id
         AND s.sale_date BETWEEN $1::date AND $2::date
         AND s.deleted_at IS NULL
         AND s.status = 'completed'
       WHERE r.deleted_at IS NULL
       GROUP BY r.id, r.name_ar, p.name_ar
       ORDER BY revenue DESC, estimated_cost DESC
       LIMIT 8`,
      [period.start, period.end]
    ),
    query(
      `SELECT r.id, r.name_ar AS recipe_name, p.name_ar AS product_name,
              COUNT(*)::int AS missing_ingredients
       FROM product_recipes r
       JOIN products p ON p.id = r.product_id
       JOIN product_recipe_items ri ON ri.recipe_id = r.id
       LEFT JOIN inventory inv ON inv.product_id = ri.ingredient_product_id
       WHERE r.deleted_at IS NULL AND r.is_active = TRUE
       GROUP BY r.id, r.name_ar, p.name_ar, ri.id, ri.quantity
       HAVING COALESCE(SUM(inv.quantity),0) < ri.quantity
       ORDER BY missing_ingredients DESC
       LIMIT 8`
    ),
    query(
      `SELECT COALESCE(SUM(total_amount),0) AS total,
              COUNT(*)::int AS count
       FROM purchase_invoices
       WHERE invoice_date BETWEEN $1::date AND $2::date
         AND deleted_at IS NULL`,
      [period.start, period.end]
    ),
    query(
      // الآن purchase_invoices لها supplier_id (migration 018) —
      // نجمع مشتريات كل مورد من purchase_invoices الحديثة المرتبطة بالمخزون
      `SELECT s.id, s.name_ar,
              GREATEST(0, COALESCE(SUM(pi.total_amount),0) - COALESCE(pay.total_paid, 0)) AS total,
              COALESCE(SUM(pi.total_amount),0) AS total_purchases,
              COALESCE(pay.total_paid, 0) AS total_paid,
              COUNT(pi.id)::int AS invoices_count
       FROM suppliers s
       LEFT JOIN purchase_invoices pi ON pi.supplier_id = s.id AND pi.deleted_at IS NULL
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(p.amount), 0) AS total_paid
         FROM payments p
         WHERE p.reference_type = 'supplier'
           AND p.reference_id = s.id
       ) pay ON TRUE
       WHERE s.deleted_at IS NULL
       GROUP BY s.id, s.name_ar, pay.total_paid
       ORDER BY total DESC
       LIMIT 8`
    ),
    query(
      `SELECT COALESCE(pc.name_ar, 'غير مصنف') AS name_ar,
              COALESCE(SUM(si.total_amount), 0)::numeric AS total,
              COALESCE(SUM(si.total_amount - si.cost_price), 0)::numeric AS profit,
              COUNT(DISTINCT si.product_id)::int AS count
       FROM sale_items si
       JOIN sales s ON si.sale_id = s.id
       JOIN products p ON si.product_id = p.id
       LEFT JOIN product_categories pc ON pc.id = p.category_id
       WHERE s.sale_date BETWEEN $1::date AND $2::date
         AND s.deleted_at IS NULL
         AND s.status = 'completed'
       GROUP BY pc.id, pc.name_ar
       ORDER BY profit DESC
       LIMIT 8`,
      [period.start, period.end]
    ),
    query(
      `SELECT payment_method,
              COALESCE(SUM(amount),0) AS total,
              COUNT(*)::int AS count
       FROM payments
       WHERE DATE(created_at) BETWEEN $1::date AND $2::date
         AND reference_type != 'invoice'
       GROUP BY payment_method
       ORDER BY total DESC`,
      [period.start, period.end]
    ),
    query(
      `SELECT movement_type,
              COALESCE(SUM(quantity),0) AS qty,
              COUNT(*)::int AS count
       FROM stock_movements
       WHERE DATE(created_at) BETWEEN $1::date AND $2::date
       GROUP BY movement_type
       ORDER BY count DESC`,
      [period.start, period.end]
    ),
    query(
      `SELECT EXTRACT(HOUR FROM sale_date + created_at::time)::int AS hour,
              COUNT(id)::int AS orders_count,
              COALESCE(SUM(total_amount), 0) AS revenue
       FROM sales
       WHERE sale_date BETWEEN $1::date AND $2::date
         AND deleted_at IS NULL
         AND status = 'completed'
       GROUP BY EXTRACT(HOUR FROM sale_date + created_at::time)
       ORDER BY hour ASC`,
      [period.start, period.end]
    ),
  ]);

  const todaySalesRow = todaySales.rows[0] || {};
  const todayExpensesRow = todayExpenses.rows[0] || {};
  const periodSalesRow = periodSales.rows[0] || {};
  const periodExpensesRow = periodExpenses.rows[0] || {};
  const previousSalesRow = previousSales.rows[0] || {};
  const previousExpensesRow = previousExpenses.rows[0] || {};
  const inventoryRow = inventoryStats.rows[0] || {};
  const recipeSummaryRow = recipeSummary.rows[0] || {};
  const purchaseSummaryRow = purchaseSummary.rows[0] || {};
  const currentMonthExpensesRow = currentMonthExpenses.rows[0] || {};
  const currentMonthPurchasesRow = currentMonthPurchases.rows[0] || {};
  const currentMonthSaleRows = currentMonthSalesByType.rows || [];
  const currentMonthSaleRow = (type) => currentMonthSaleRows.find((row) => row.sale_type === type) || {};
  const currentMonthBranchSales = toNumber(currentMonthSaleRow('branch').total);
  const currentMonthWholesaleSales = toNumber(currentMonthSaleRow('wholesale').total);
  const currentMonthBranchCount = toNumber(currentMonthSaleRow('branch').count);
  const currentMonthWholesaleCount = toNumber(currentMonthSaleRow('wholesale').count);
  const currentMonthTotalSales = currentMonthBranchSales + currentMonthWholesaleSales;
  const currentMonthSalesCount = currentMonthBranchCount + currentMonthWholesaleCount;
  const currentMonthExpensesTotal = toNumber(currentMonthExpensesRow.total);
  const currentMonthPurchasesTotal = toNumber(currentMonthPurchasesRow.total);
  const openingBalanceRow = await getOpeningBalanceForDate(currentMonthDate);
  const openingBalanceTotal = toNumber(openingBalanceRow.amount);

  const periodCogs = toNumber(periodSalesRow.cost) > 0 ? toNumber(periodSalesRow.cost) : toNumber(periodPurchases.rows[0]?.total);
  const previousCogs = toNumber(previousSalesRow.cost) > 0 ? toNumber(previousSalesRow.cost) : toNumber(previousPurchases.rows[0]?.total);
  const todayCogs = toNumber(todaySalesRow.cost) > 0 ? toNumber(todaySalesRow.cost) : toNumber(todayPurchases.rows[0]?.total);
  const periodGrossProfit = roundMoney(toNumber(periodSalesRow.total) - periodCogs);
  const previousGrossProfit = roundMoney(toNumber(previousSalesRow.total) - previousCogs);
  const todayGrossProfit = roundMoney(toNumber(todaySalesRow.total) - todayCogs);
  const cogsBasis = toNumber(periodSalesRow.cost) > 0 ? 'sales_cost' : 'purchases_estimate';

  const netProfit = roundMoney(periodGrossProfit - toNumber(periodExpensesRow.total));
  const previousNetProfit = roundMoney(previousGrossProfit - toNumber(previousExpensesRow.total));
  const todayNet = roundMoney(todayGrossProfit - toNumber(todayExpensesRow.total));
  const collectionRate = toNumber(periodSalesRow.total) > 0
    ? roundMoney(((toNumber(periodSalesRow.total) - toNumber(unpaidInvoices.rows[0]?.amount)) / toNumber(periodSalesRow.total)) * 100)
    : 100;
  const unpaidAmount = roundMoney(unpaidInvoices.rows[0]?.amount);
  const cashFlowMonth = roundMoney(openingBalanceTotal + toNumber(periodSalesRow.total) - toNumber(periodExpensesRow.total) - toNumber(purchaseSummaryRow.total));
  const realIncomeMonth = roundMoney(cashFlowMonth - unpaidAmount);

  const periodPayload = {
    sales: roundMoney(periodSalesRow.total),
    cost: roundMoney(periodCogs),
    grossProfit: periodGrossProfit,
    expenses: roundMoney(periodExpensesRow.total),
    netProfit,
    cogsBasis,
    salesCount: toNumber(periodSalesRow.count),
    expensesCount: toNumber(periodExpensesRow.count),
    avgDailySales: roundMoney(toNumber(periodSalesRow.total) / period.days),
    collectionRate,
  };

  return {
    period,
    today: {
      sales: roundMoney(todaySalesRow.total),
      expenses: roundMoney(todayExpensesRow.total),
      net: todayNet,
      cost: roundMoney(todayCogs),
      grossProfit: todayGrossProfit,
      salesCount: toNumber(todaySalesRow.count),
      expensesCount: toNumber(todayExpensesRow.count),
    },
    month: periodPayload,
    comparison: {
      sales: pctChange(periodSalesRow.total, previousSalesRow.total),
      grossProfit: pctChange(periodGrossProfit, previousGrossProfit),
      expenses: pctChange(periodExpensesRow.total, previousExpensesRow.total),
      netProfit: pctChange(netProfit, previousNetProfit),
      salesCount: pctChange(periodSalesRow.count, previousSalesRow.count),
      previous: {
        sales: roundMoney(previousSalesRow.total),
        cost: roundMoney(previousCogs),
        grossProfit: previousGrossProfit,
        expenses: roundMoney(previousExpensesRow.total),
        netProfit: previousNetProfit,
        salesCount: toNumber(previousSalesRow.count),
      },
    },
    monthCards: {
      period: currentMonth,
      branchSales: roundMoney(currentMonthBranchSales),
      branchSalesCount: currentMonthBranchCount,
      wholesaleSales: roundMoney(currentMonthWholesaleSales),
      wholesaleSalesCount: currentMonthWholesaleCount,
      totalSales: roundMoney(currentMonthTotalSales),
      salesCount: toNumber(currentMonthSalesCount),
      expenses: roundMoney(currentMonthExpensesTotal),
      expensesCount: toNumber(currentMonthExpensesRow.count),
      purchases: roundMoney(currentMonthPurchasesTotal),
      purchasesCount: toNumber(currentMonthPurchasesRow.count),
      openingBalance: roundMoney(openingBalanceTotal),
      cashNet: roundMoney(openingBalanceTotal + currentMonthTotalSales - currentMonthPurchasesTotal - currentMonthExpensesTotal),
    },
    salesByType: salesByType.rows,
    paymentSummary: paymentSummary.rows,
    unpaidInvoices: {
      count: toNumber(unpaidInvoices.rows[0]?.count),
      amount: roundMoney(unpaidInvoices.rows[0]?.amount),
    },
    customersCount: toNumber(customersCount.rows[0]?.count),
    inventoryStats: {
      products: toNumber(inventoryRow.products),
      total_qty: roundMoney(inventoryRow.total_qty),
      inventory_value: roundMoney(inventoryRow.inventory_value),
      warehouses: toNumber(inventoryRow.warehouses),
    },
    stockAlerts: toNumber(stockAlerts.rows[0]?.count),
    lowStock: lowStock.rows,
    topProducts: topProducts.rows,
    recentSales: recentSales.rows,
    recentActivity: recentActivity.rows,
    salesTrend: salesTrend.rows,
    expenseTrend: expenseTrend.rows,
    expenseByCategory: expenseByCategory.rows,
    inventoryChart: inventoryChart.rows,
    stockByWarehouse: stockByWarehouse.rows,
    topCustomers: topCustomers.rows,
    recipeSummary: {
      total: toNumber(recipeSummaryRow.total),
      active: toNumber(recipeSummaryRow.active),
      ingredients: toNumber(recipeSummaryRow.ingredients),
      shortageRecipes: toNumber(recipeSummaryRow.shortage_recipes),
    },
    recipeCostChart: recipeCostChart.rows,
    recipeAlerts: recipeAlerts.rows,
    purchaseSummary: {
      total: roundMoney(purchaseSummaryRow.total),
      count: toNumber(purchaseSummaryRow.count),
    },
    supplierSummary: supplierSummary.rows,
    categoryProfitability: categoryProfitability.rows,
    paymentMethodSummary: paymentMethodSummary.rows,
    stockMovementSummary: stockMovementSummary.rows,
    peakHours: peakHours.rows,

    dailySales: { total: roundMoney(todaySalesRow.total), count: toNumber(todaySalesRow.count) },
    monthlySales: { total: periodPayload.sales, profit: periodPayload.grossProfit, count: periodPayload.salesCount },
    todayProfit: roundMoney(todaySalesRow.profit),
    monthlyExpenses: periodPayload.expenses,
    retailMonthly: roundMoney(salesByType.rows.filter((r) => r.sale_type !== 'wholesale').reduce((sum, r) => sum + toNumber(r.total), 0)),
    wholesaleMonthly: roundMoney(salesByType.rows.find((r) => r.sale_type === 'wholesale')?.total),
    avgDailySalesMonth: periodPayload.avgDailySales,
    cashFlowMonth,
    realIncomeMonth,
    salesChart: salesTrend.rows,
    profitChart: salesTrend.rows,
  };
};

// BUG-09 FIX: wrapper عام يستخدم الـ cache
export const getDashboardStats = async (filters = {}) => {
  const cacheKey = JSON.stringify(filters);
  const cached = _getCached(cacheKey);
  if (cached) return cached;
  const result = await _computeDashboardStats(filters);
  _setCached(cacheKey, result);
  return result;
};
