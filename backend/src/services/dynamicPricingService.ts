import pool, { query } from '../database/pool.ts';
import { getProductsEffectiveCosts } from './productCostService.ts';

/**
 * خدمة التسعير الذكي وحماية هوامش الربح
 */
/**
 * تنبيهات التسعير الذكي (منتجات باهظة/رخيصة مقارنة بالتكلفة).
 * @returns {Promise<any[]>}
 */
export const getSmartPricingAlerts = async () => {
  // 1. جلب كافة المنتجات الفعالة
  const productsSql = `
    SELECT 
      p.id, p.sku, p.name_ar, p.unit, 
      COALESCE(p.sale_price, 0) AS sale_price, 
      COALESCE(p.purchase_price, 0) AS purchase_price, 
      pc.name_ar AS category_name,
      r.id AS recipe_id,
      CASE WHEN r.id IS NOT NULL THEN TRUE ELSE FALSE END AS has_recipe
    FROM products p
    LEFT JOIN product_categories pc ON pc.id = p.category_id
    LEFT JOIN product_recipes r ON r.product_id = p.id AND r.deleted_at IS NULL AND r.is_active = TRUE
    WHERE p.deleted_at IS NULL
  `;
  const products = (await query(productsSql)).rows;

  // 2. حساب التكلفة الفعلية والعودية لكل منتج (تدعم تحويل الوحدات والوصفات المتداخلة)
  const productIds = products.map((p) => p.id);
  const costsMap = await getProductsEffectiveCosts(pool, productIds);

  // 3. مقارنة التكلفة بسعر البيع وحساب الهوامش والأخطار
  const alerts: any[] = [];
  const TARGET_MARGIN = 0.6; // هامش الربح المستهدف (60%)

  products.forEach((p) => {
    const costResolved = costsMap.get(p.id);
    const cost = costResolved ? costResolved.cost : Number(p.purchase_price || 0);
    const salePrice = Number(p.sale_price);

    if (salePrice === 0) return; // صنف غير معروض للبيع

    // هامش الربح = (سعر البيع - التكلفة) / سعر البيع
    const profit = salePrice - cost;
    const margin = Number((profit / salePrice).toFixed(3));

    // إذا كان الهامش أقل من 50% نعتبره تنبيهاً، وإذا قل عن 25% أو كان سالباً فهو حرج
    let status = 'healthy';
    let statusAr = 'مستقر';

    if (margin < 0.25) {
      status = 'critical';
      statusAr = 'خطر / خسارة';
    } else if (margin < 0.5) {
      status = 'warning';
      statusAr = 'هامش منخفض';
    }

    // اقتراح سعر البيع المستهدف بناءً على التكلفة والهامش المستهدف (60%)
    // سعر البيع المقترح = التكلفة / (1 - الهامش المستهدف)
    const suggestedPrice = Number((cost / (1 - TARGET_MARGIN)).toFixed(2));

    alerts.push({
      product_id: p.id,
      sku: p.sku,
      name_ar: p.name_ar,
      unit: p.unit,
      category_name: p.category_name,
      current_price: salePrice,
      cost: Number(cost.toFixed(2)),
      margin: Number((margin * 100).toFixed(1)), // كنسبة مئوية
      suggested_price: suggestedPrice,
      status,
      status_ar: statusAr,
    });
  });

  // ترتيب التنبيهات: الأصناف الحرجة أولاً، ثم الأصناف ذات الهامش المنخفض
  alerts.sort((a, b) => {
    if (a.status === 'critical' && b.status !== 'critical') return -1;
    if (a.status !== 'critical' && b.status === 'critical') return 1;
    if (a.status === 'warning' && b.status === 'healthy') return -1;
    if (a.status === 'healthy' && b.status === 'warning') return 1;
    return a.margin - b.margin; // الهامش الأقل أولاً
  });

  return alerts;
};
