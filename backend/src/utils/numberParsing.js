const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

export const normalizeLocalizedNumberText = (value) => {
  const text = String(value ?? '')
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String(PERSIAN_DIGITS.indexOf(digit)))
    .replace(/[\u200e\u200f\s]/g, '')
    .replace(/٬/g, '')
    .replace(/٫/g, '.')
    .trim();

  if (!text) return '';

  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');
  if (lastComma === -1) return text;

  if (lastDot === -1) {
    return /^[-+]?\d{1,3}(,\d{3})+$/.test(text)
      ? text.replace(/,/g, '')
      : text.replace(/,/g, '.');
  }

  if (lastComma > lastDot) {
    return text.replace(/\./g, '').replace(/,/g, '.');
  }

  return text.replace(/,/g, '');
};

export const parseLocalizedNumber = (value, fallback = NaN) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  const parsed = Number(normalizeLocalizedNumberText(value));
  return Number.isFinite(parsed) ? parsed : fallback;
};
