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
 * اسم بديل دلالي لـ toNumber للوضوح في السياق المالي.
 */
const parseAmount = toNumber;

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

/**
 * جمع مبالغ مالية بدقة (تحصين الفاصلة العائمة):
 * تُكمَّم كل قيمة إلى قرش (×100) كعدد صحيح ثم تُجمع كأعداد صحيحة —
 * فيتجنب انحرافات 0.1+0.2=0.30000000000000004 في المجاميع المتراكمة.
 * @param {(number | string | null | undefined)[]} values المبالغ
 * @returns {number} المجموع مقرّبًا إلى قرشين
 */
const sumMoney = (...values: (number | string | null | undefined)[]) => {
  let cents = 0;
  for (const v of values) {
    cents += Math.round((Number(v) || 0) * 100);
  }
  return cents / 100;
};

/**
 * قسمة آمنة مع بديل افتراضي — تمنع Infinity/NaN عند قسمة صفر.
 * @param {number} numerator البسط
 * @param {number} denominator المقام
 * @param {number} [fallback] القيمة عند صفر المقام (افتراضي 0)
 * @returns {number} الناتج أو البديل
 */
const safeDivide = (numerator: number, denominator: number, fallback = 0) => {
  const den = Number(denominator) || 0;
  if (den === 0) return fallback;
  return (Number(numerator) || 0) / den;
};
export { parseAmount, roundMoney, safeDivide, sanitizeLimit, sumMoney, toNumber };
