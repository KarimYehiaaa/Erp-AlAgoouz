/**
 * أدوات حساب تكلفة الوصفات المشتركة بين مودال الوصفة وحاسبة التوليفات.
 * كل الدوال نقية — بلا حالة.
 */

/**
 * تطبيع رمز الوحدة (عربي/إنجليزي) إلى كود موحد (kg/g/l/ml/count).
 * @param u — رمز الوحدة الخام من DB أو الإدخال
 * @returns الكود الموحد أو null إن لم يُعرف
 */
export const normalizeUnit = (u: any): string | null => {
  const map: Record<string, string> = {
    kg: 'kg',
    kilo: 'kg',
    كيلو: 'kg',
    كيلوجرام: 'kg',
    كجم: 'kg',
    g: 'g',
    gram: 'g',
    جرام: 'g',
    غرام: 'g',
    l: 'l',
    liter: 'l',
    litre: 'l',
    لتر: 'l',
    ml: 'ml',
    milli: 'ml',
    ملي: 'ml',
    مل: 'ml',
    count: 'count',
    unit: 'count',
    piece: 'count',
    pieces: 'count',
    عدد: 'count',
    قطعة: 'count',
  };
  return (
    map[
      String(u || '')
        .trim()
        .toLowerCase() as keyof typeof map
    ] || null
  );
};

/**
 * تحويل كمية بين وحدتين فيزيائيتين.
 * @param qty — الكمية
 * @param from — وحدة المصدر
 * @param to — وحدة الهدف
 * @returns الكمية المحولة أو null عند تعذر التحويل
 */
export const convertQty = (qty: any, from: any, to: any): number | null => {
  if (from === to) return qty;
  if (from === 'kg' && to === 'g') return qty * 1000;
  if (from === 'g' && to === 'kg') return qty / 1000;
  if (from === 'l' && to === 'ml') return qty * 1000;
  if (from === 'ml' && to === 'l') return qty / 1000;
  return null;
};

/**
 * سعر الوحدة الواحدة من سعر أساسي بوحدة المنتج إلى الوحدة المطلوبة.
 * @param basePrice — السعر الأساسي (شراء/بيع)
 * @param productUnit — وحدة المنتج
 * @param wantedUnit — الوحدة المطلوبة
 * @returns سعر الوحدة أو 0 عند تعذر التحويل
 */
export const unitPriceFor = (basePrice: any, productUnit: any, wantedUnit: any): number => {
  const from = normalizeUnit(productUnit);
  const to = normalizeUnit(wantedUnit);
  if (!from || !to) return 0;
  const c = convertQty(1, from, to);
  if (c == null || c === 0) return 0;
  return Number(basePrice || 0) / c;
};

/**
 * تكلفة بند مكون داخل وصفة — بالبحث عن المنتج في القائمة الكاملة.
 * @param item — بند الوصفة { ingredient_product_id, quantity, unit_code }
 * @param allProducts — قائمة المنتجات الكاملة
 * @returns التكلفة المحسوبة (صفر إن لم يوجد المنتج)
 */
export const itemCost = (item: any, allProducts: any[]): number => {
  const p = allProducts.find((x: any) => x.id === item.ingredient_product_id);
  if (!p) return 0;

  // fallback: لو purchase_price صفر/غير موجود استخدم sale_price
  const basePrice =
    Number(p.purchase_price || 0) > 0
      ? p.purchase_price
      : Number(p.sale_price || 0) > 0
        ? p.sale_price
        : 0;

  const price = unitPriceFor(basePrice, p.unit, item.unit_code);
  return Number(item.quantity || 0) * price;
};
