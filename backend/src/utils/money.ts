/**
 * تقريب مبلغ إلى منزلتين عشريتين (للتخلص من أخطاء الفاصلة العائمة).
 * @param {any} value القيمة
 * @returns {number} المبلغ المُقرَّب
 */
const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

/**
 * تحويل قيمة إلى رقم مع قيمة بديلة للقيم الفارغة/غير الصالحة.
 * @param {any} value القيمة
 * @param {number} [fallback] القيمة البديلة (افتراضي 0)
 * @returns {number} الرقم
 */
const toNumber = (value, fallback = 0) => {
  if (value === null || value === void 0 || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

/**
 * تحليل مبلغ مالي إلى رقم (مع قيمة بديلة).
 * @param {any} value القيمة
 * @param {number} [fallback] القيمة البديلة (افتراضي 0)
 * @returns {number} المبلغ
 */
const parseAmount = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * تحديد حد أقصى آمن لعدد النتائج (LIMIT) مع حد أدنى وافتراضي.
 * @param {any} value القيمة المطلوبة
 * @param {number} [fallback] القيمة الافتراضية (افتراضي 100)
 * @param {number} [max] الحد الأقصى المسموح (افتراضي 500)
 * @returns {number} الحد المحسوب
 */
const sanitizeLimit = (value, fallback = 100, max = 500) => {
  const n = Math.floor(toNumber(value, fallback));
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, max);
};
export { parseAmount, roundMoney, sanitizeLimit, toNumber };
