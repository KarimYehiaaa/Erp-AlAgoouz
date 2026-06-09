/** Currency formatting for EGP */
export const CURRENCY = {
  code: 'EGP',
  symbol: 'ج.م',
  locale: 'en-US',
  country: 'مصر',
};

export const formatMoney = (value, options = {}) => {
  const num = Number(value || 0);
  if (options.compact) {
    return `${num.toLocaleString(CURRENCY.locale, { maximumFractionDigits: 0 })} ${CURRENCY.symbol}`;
  }
  return `${num.toLocaleString(CURRENCY.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${CURRENCY.symbol}`;
};

export const formatNumber = (value, options = {}) => {
  const num = Number(value || 0);
  return num.toLocaleString(CURRENCY.locale, {
    minimumFractionDigits: options.minimumFractionDigits ?? 0,
    maximumFractionDigits: options.maximumFractionDigits ?? 2,
  });
};

export const TAX_RATE = 0; // VAT disabled per user request
