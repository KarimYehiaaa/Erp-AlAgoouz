import { query } from '../database/pool.js';

/**
 * خدمة تحليل سلة المشتريات لاستخراج التوصيات الذكية
 */
export const getMarketBasketRecommendations = async (params = {}) => {
  const warehouseId = Number(params.warehouse_id) || 1;
  const currentCart = Array.isArray(params.cart)
    ? params.cart.map(Number)
    : params.cart
      ? String(params.cart).split(',').map(Number)
      : [];

  if (currentCart.length === 0) {
    return [];
  }

  // 1. جلب المبيعات وعناصر الفواتير لآخر 90 يوماً لهذا المخزن
  const sql = `
    SELECT si.sale_id, si.product_id
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    WHERE s.status = 'completed' AND s.deleted_at IS NULL
      AND s.warehouse_id = $1
      AND s.sale_date >= CURRENT_DATE - INTERVAL '90 days'
  `;

  const saleItems = (await query(sql, [warehouseId])).rows;

  // 2. تجميع المنتجات لكل فاتورة
  const transactions = {};
  saleItems.forEach((item) => {
    if (!transactions[item.sale_id]) {
      transactions[item.sale_id] = new Set();
    }
    transactions[item.sale_id].add(Number(item.product_id));
  });

  // 3. حساب الدعم والثقة للمنتجات الأخرى المشتراة مع السلة الحالية
  const cartSet = new Set(currentCart);
  let cartCount = 0;
  const coOccurrences = {}; // منتج آخر -> عدد مرات الترافق

  Object.values(transactions).forEach((itemSet) => {
    // تحقق مما إذا كانت الفاتورة تحتوي على جميع عناصر السلة الحالية
    const containsCart = currentCart.every((prodId) => itemSet.has(prodId));
    if (containsCart) {
      cartCount++;
      // احسب المنتجات الأخرى التي ظهرت مع السلة في نفس الفاتورة
      itemSet.forEach((prodId) => {
        if (!cartSet.has(prodId)) {
          coOccurrences[prodId] = (coOccurrences[prodId] || 0) + 1;
        }
      });
    }
  });

  if (cartCount === 0) {
    return []; // السلة الحالية لم تُشترَ من قبل، لا توجد إحصائيات
  }

  // 4. جلب تفاصيل المنتجات الأخرى لحساب التوصيات النهائية
  const recommendedIds = Object.keys(coOccurrences).map(Number);
  if (recommendedIds.length === 0) {
    return [];
  }

  const productsSql = `
    SELECT p.id, p.sku, p.name_ar, p.sale_price, p.unit, pc.name_ar AS category_name
    FROM products p
    LEFT JOIN product_categories pc ON pc.id = p.category_id
    WHERE p.id = ANY($1::int[]) AND p.deleted_at IS NULL
  `;
  const products = (await query(productsSql, [recommendedIds])).rows;

  // 5. حساب الثقة وترتيب المنتجات تنازلياً
  const recommendations = products
    .map((prod) => {
      const coCount = coOccurrences[prod.id] || 0;
      const confidence = Number((coCount / cartCount).toFixed(3)); // نسبة الاحتمالية
      return {
        product_id: prod.id,
        sku: prod.sku,
        name_ar: prod.name_ar,
        sale_price: Number(prod.sale_price),
        unit: prod.unit,
        category_name: prod.category_name,
        confidence, // احتمال الشراء المشترك (0.0 to 1.0)
        co_occurrence: coCount,
      };
    })
    .filter((r) => r.confidence >= 0.05) // استبعاد الترافق النادر جداً (أقل من 5%)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5); // أقصى حد 5 توصيات

  return recommendations;
};
