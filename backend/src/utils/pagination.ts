/**
 * حساب معاملات الترقيم (page/limit/offset) من عوامل التصفية مع حدود آمنة.
 * @param {Record<string, any>} [filters] عوامل التصفية (page، limit)
 * @param {number} [defaultLimit] الحد الافتراضي
 * @param {number} [maxLimit] الحد الأقصى المسموح
 * @returns {{ page: number, limit: number, offset: number }} معاملات الترقيم
 */
export const getPaginationParams = (
  filters: Record<string, any> = {},
  defaultLimit = 100,
  maxLimit = 500,
) => {
  const page = Math.max(1, parseInt(filters.page) || 1);
  const limit = Math.min(Math.max(1, parseInt(filters.limit) || defaultLimit), maxLimit);
  const offset = (page - 1) * limit;
  return { page, limit, offset };
};

/**
 * بناء بيانات الترقيم للاستجابة.
 * @param {number | string} total إجمالي النتائج
 * @param {number} page الصفحة الحالية
 * @param {number} limit حجم الصفحة
 * @returns {{ total: number, page: number, limit: number, totalPages: number }} بيانات الترقيم
 */
export const buildPaginationMeta = (total, page, limit) => {
  return {
    total: Number(total),
    page,
    limit,
    totalPages: Math.ceil(Number(total) / limit),
  };
};
