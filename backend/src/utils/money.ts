/**
 * utils/money.ts — دوال مساعدة للحسابات المالية
 * ════════════════════════════════════════════════════════
 * نقطة واحدة موحدة لتقريب وتحويل الأرقام المالية.
 * تُستخدم في كل الـ Services بدلاً من تكرار الدوال المحلية.
 */

/**
 * تقريب مبلغ مالي لأقرب قرش (خانتان عشريتان)
 * يمنع أخطاء floating point مثل 0.1 + 0.2 ≠ 0.3
 * @param value - المبلغ
 * @returns {number}
 */
export const roundMoney = (value: number | string | null | undefined): number => Math.round((Number(value) || 0) * 100) / 100;

/**
 * تحويل قيمة إلى رقم مع قيمة افتراضية آمنة
 * يتعامل مع null, undefined, NaN, '' بذكاء
 * @param value - القيمة المراد تحويلها
 * @param fallback - القيمة الافتراضية (0)
 * @returns {number}
 */
export const toNumber = (value: any, fallback: number = 0): number => {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

/**
 * تحليل مبلغ مع fallback — مختصر لـ parseAmount
 * @param value
 * @param fallback
 * @returns {number}
 */
export const parseAmount = (value: any, fallback: number = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * تطبيع حد الصفحات (Limit) مع حد أقصى
 * @param value - القيمة المطلوبة
 * @param fallback - الافتراضي (100)
 * @param max - الحد الأقصى (500)
 * @returns {number}
 */
export const sanitizeLimit = (value: any, fallback: number = 100, max: number = 500): number => {
  const n = Math.floor(toNumber(value, fallback));
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, max);
};
