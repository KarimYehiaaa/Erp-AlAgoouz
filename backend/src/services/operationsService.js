import { query } from '../database/pool.js';
import { getProducts } from './productService.js';
import { toNumber, sanitizeLimit } from '../utils/money.js';

const normalizeFilter = (value) => {
  const text = String(value || '').trim();
  return text || null;
};

export const getAuditLogs = async (filters = {}) => {
  const limit = sanitizeLimit(filters.limit);
  const userId = Number(filters.user_id) || null;
  const action = normalizeFilter(filters.action);
  const entityType = normalizeFilter(filters.entity_type);
  const fromDate = normalizeFilter(filters.from_date);
  const toDate = normalizeFilter(filters.to_date);

  const result = await query(
    `SELECT al.id, al.action, al.entity_type, al.entity_id,
            al.old_data, al.new_data, al.ip_address, al.created_at,
            u.username, u.full_name
     FROM audit_logs al
     LEFT JOIN users u ON u.id = al.user_id
     WHERE ($1::int IS NULL OR al.user_id = $1)
       AND ($2::text IS NULL OR al.action = $2)
       AND ($3::text IS NULL OR al.entity_type = $3)
       AND ($4::date IS NULL OR al.created_at::date >= $4)
       AND ($5::date IS NULL OR al.created_at::date <= $5)
     ORDER BY al.created_at DESC, al.id DESC
     LIMIT ${limit}`,
    [userId, action, entityType, fromDate, toDate],
  );

  return result.rows;
};

export const getOperationAlerts = async () => {
  const [lowStockRes, customerDebtRes, supplierDebtRes, openSalesRes] = await Promise.all([
    query(
      `SELECT product_id, name_ar, sku, total_quantity, min_stock
       FROM v_product_stock
       WHERE is_low_stock = TRUE
       ORDER BY total_quantity ASC, name_ar
       LIMIT 20`,
    ),
    query(
      `SELECT id, name_ar, balance
       FROM customers
       WHERE deleted_at IS NULL AND is_active = TRUE AND COALESCE(balance, 0) > 0
       ORDER BY balance DESC
       LIMIT 10`,
    ),
    query(
      `SELECT s.id, s.name_ar,
              COALESCE(SUM(pi.total_amount), 0) - COALESCE(paid.total_paid, 0) AS balance
       FROM suppliers s
       LEFT JOIN purchase_invoices pi ON pi.supplier_id = s.id AND pi.deleted_at IS NULL
       LEFT JOIN (
         SELECT reference_id AS supplier_id, SUM(amount) AS total_paid
         FROM payments
         WHERE reference_type = 'supplier'
         GROUP BY reference_id
       ) paid ON paid.supplier_id = s.id
       WHERE s.deleted_at IS NULL
       GROUP BY s.id, s.name_ar, paid.total_paid
       HAVING COALESCE(SUM(pi.total_amount), 0) - COALESCE(paid.total_paid, 0) > 0
       ORDER BY balance DESC
       LIMIT 10`,
    ),
    query(
      `WITH sale_balances AS (
         SELECT s.id,
                GREATEST(0, COALESCE(s.total_amount, 0) - COALESCE(p.total_paid, 0)) AS balance
         FROM sales s
         LEFT JOIN (
           SELECT reference_id AS sale_id, SUM(amount) AS total_paid
           FROM payments
           WHERE reference_type = 'sale'
           GROUP BY reference_id
         ) p ON p.sale_id = s.id
         WHERE s.deleted_at IS NULL
           AND s.sale_type = 'wholesale'
           AND s.status = 'completed'
       )
       SELECT COUNT(*) FILTER (WHERE balance > 0.01)::int AS count,
              COALESCE(SUM(balance) FILTER (WHERE balance > 0.01), 0) AS total
       FROM sale_balances`,
    ),
  ]);

  const products = await getProducts({ is_active: true, limit: 500 });
  const missingCost = products
    .filter((product) => toNumber(product.effective_cost ?? product.purchase_price) <= 0)
    .slice(0, 20)
    .map((product) => ({
      id: product.id,
      sku: product.sku,
      name_ar: product.name_ar,
      cost_source: product.cost_source,
      has_active_recipe: product.has_active_recipe,
    }));

  const alerts = [];

  if (lowStockRes.rows.length) {
    alerts.push({
      type: 'low_stock',
      severity: 'warning',
      title: 'منتجات تحت حد الطلب',
      message: `${lowStockRes.rows.length} منتج يحتاج متابعة مخزون.`,
      count: lowStockRes.rows.length,
      action_to: '/inventory',
      items: lowStockRes.rows,
    });
  }

  if (missingCost.length) {
    alerts.push({
      type: 'missing_cost',
      severity: 'danger',
      title: 'منتجات بدون تكلفة مؤكدة',
      message: `${missingCost.length} منتج لا يملك تكلفة فعالة، وهذا يؤثر على الربحية.`,
      count: missingCost.length,
      action_to: '/products',
      items: missingCost,
    });
  }

  if (customerDebtRes.rows.length) {
    alerts.push({
      type: 'customer_debt',
      severity: 'info',
      title: 'مديونيات عملاء قائمة',
      message: `أعلى ${customerDebtRes.rows.length} عملاء عليهم رصيد مستحق.`,
      count: customerDebtRes.rows.length,
      action_to: '/customers',
      items: customerDebtRes.rows,
    });
  }

  if (supplierDebtRes.rows.length) {
    alerts.push({
      type: 'supplier_debt',
      severity: 'warning',
      title: 'أرصدة موردين مستحقة',
      message: `يوجد ${supplierDebtRes.rows.length} مورد له رصيد شراء غير مسدد.`,
      count: supplierDebtRes.rows.length,
      action_to: '/suppliers',
      items: supplierDebtRes.rows,
    });
  }

  const openSales = openSalesRes.rows[0] || {};
  if (Number(openSales.count || 0) > 0) {
    alerts.push({
      type: 'open_sales_credit',
      severity: 'info',
      title: 'آجل مبيعات غير محصل',
      message: `${openSales.count} عملية بيع عليها متبقي بإجمالي ${Number(openSales.total || 0).toFixed(2)}.`,
      count: Number(openSales.count || 0),
      action_to: '/sales',
      items: [openSales],
    });
  }

  return {
    generated_at: new Date().toISOString(),
    total: alerts.length,
    critical: alerts.filter((alert) => alert.severity === 'danger').length,
    alerts,
  };
};
