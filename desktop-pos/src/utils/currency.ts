/** Currency formatting for EGP */
export const CURRENCY = {
  code: 'EGP',
  symbol: 'ج.م',
  locale: 'en-US',
  country: 'مصر',
};

/** خيارات تنسيق العملة. */
export interface MoneyFormatOptions {
  compact?: boolean;
}

/** خيارات تنسيق الأرقام. */
export interface NumberFormatOptions {
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
}

/**
 * تنسيق مبلغ مالي بعملة الجنية المصري.
 * @param {any} value القيمة
 * @param {MoneyFormatOptions} [options] خيارات التنسيق
 * @returns {string} المبلغ المنسق مع رمز العملة
 */
export const formatMoney = (value: any, options: MoneyFormatOptions = {}) => {
  const num = Number(value || 0);
  if (options.compact) {
    return `${num.toLocaleString(CURRENCY.locale, { maximumFractionDigits: 0 })} ${CURRENCY.symbol}`;
  }
  return `${num.toLocaleString(CURRENCY.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${CURRENCY.symbol}`;
};

/**
 * تنسيق رقم مع عدد منازل عشرية مخصص.
 * @param {any} value القيمة
 * @param {NumberFormatOptions} [options] خيارات المنازل العشرية
 * @returns {string} الرقم المنسق
 */
export const formatNumber = (value: any, options: NumberFormatOptions = {}) => {
  const num = Number(value || 0);
  return num.toLocaleString(CURRENCY.locale, {
    minimumFractionDigits: options.minimumFractionDigits ?? 0,
    maximumFractionDigits: options.maximumFractionDigits ?? 2,
  });
};

/** نسبة الضريبة (معطّلة حسب طلب المستخدم). */
export const TAX_RATE = 0; // VAT disabled per user request
