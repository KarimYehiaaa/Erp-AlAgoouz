/** Supported measurement aliases shared by recipe editors and server calculations. */
export const UNIT_ALIASES = Object.freeze({
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
} as const);

export type MeasurementUnit = (typeof UNIT_ALIASES)[keyof typeof UNIT_ALIASES];

export const normalizeUnit = (value: unknown): MeasurementUnit | null => {
  if (typeof value !== 'string') return null;
  const key = value.trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(UNIT_ALIASES, key)
    ? UNIT_ALIASES[key as keyof typeof UNIT_ALIASES]
    : null;
};
