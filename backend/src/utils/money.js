const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;
const toNumber = (value, fallback = 0) => {
  if (value === null || value === void 0 || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};
const parseAmount = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const sanitizeLimit = (value, fallback = 100, max = 500) => {
  const n = Math.floor(toNumber(value, fallback));
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, max);
};
export {
  parseAmount,
  roundMoney,
  sanitizeLimit,
  toNumber
};
