const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

/**
 * تطبيع نص رقمي محلي (أرقام عربية/فارسية، فواصل الآلاف، فاصلة عشرية عربية) إلى نص قياسي.
 * @param {any} value القيمة المدخلة
 * @returns {string} النص المُطبَّع
 */
export const normalizeLocalizedNumberText = (value: any): string => {
  const text = String(value ?? '')
    .replace(/[٠-٩]/g, (digit: any) => String(ARABIC_DIGITS.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit: any) => String(PERSIAN_DIGITS.indexOf(digit)))
    .replace(/[\u200e\u200f\s]/g, '')
    .replace(/٬/g, '')
    .replace(/٫/g, '.')
    .trim();

  if (!text) return '';

  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');
  if (lastComma === -1) return text;

  if (lastDot === -1) {
    return /^[-+]?\d{1,3}(,\d{3})+$/.test(text) ? text.replace(/,/g, '') : text.replace(/,/g, '.');
  }

  if (lastComma > lastDot) {
    return text.replace(/\./g, '').replace(/,/g, '.');
  }

  return text.replace(/,/g, '');
};

/**
 * تحليل رقم محلي (نصي أو رقمي) إلى رقم مع قيمة بديلة عند الفشل.
 * @param {any} value القيمة
 * @param {number} [fallback] القيمة البديلة (افتراضي 0)
 * @returns {number} الرقم المُحلَّل
 */
export const parseLocalizedNumber = (value: any, fallback = 0): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  const parsed = Number(normalizeLocalizedNumberText(value));
  return Number.isFinite(parsed) ? parsed : fallback;
};
