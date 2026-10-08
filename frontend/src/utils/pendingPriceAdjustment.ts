export type PriceAdjustmentPayload = {
  category_id: number | null;
  all_products: boolean;
  type: 'sale' | 'purchase';
  adjust_type: 'percent' | 'fixed';
  value: number;
};
export type PendingPriceAdjustment = {
  version: 1;
  key: string;
  createdAt: number;
  payload: PriceAdjustmentPayload;
};

// The server may replace completed responses after 24 hours. Stop automatic
// replay earlier, allowing a margin for request time and client clock drift.
export const PRICE_REPLAY_WINDOW_MS = 23 * 60 * 60 * 1000;
const storageKey = (scope: string) => `alagoouz:pending-price-adjustment:v1:${scope}`;
const invalidRecord = () =>
  new Error('تعذر قراءة التعديل المعلق؛ راجع نتيجة التعديل السابق قبل المتابعة.');

export const readPendingPriceAdjustment = (scope: string): PendingPriceAdjustment | undefined => {
  const raw = localStorage.getItem(storageKey(scope));
  if (raw === null) return undefined;
  let entry: PendingPriceAdjustment;
  try {
    entry = JSON.parse(raw);
  } catch {
    throw invalidRecord();
  }
  const data = entry?.payload;
  if (
    entry?.version !== 1 ||
    typeof entry.key !== 'string' ||
    !/^[a-zA-Z0-9-]{1,50}$/.test(entry.key) ||
    !Number.isFinite(entry.createdAt) ||
    entry.createdAt <= 0 ||
    !data ||
    !['sale', 'purchase'].includes(data.type) ||
    !['percent', 'fixed'].includes(data.adjust_type) ||
    !Number.isFinite(data.value) ||
    data.value === 0 ||
    data.value < -100 ||
    data.value > 10_000_000 ||
    typeof data.all_products !== 'boolean' ||
    (data.category_id !== null &&
      (!Number.isSafeInteger(data.category_id) || data.category_id <= 0)) ||
    data.all_products !== (data.category_id === null)
  )
    throw invalidRecord();
  // Return canonical fields/order for comparison, without accepting extra stored fields.
  return {
    version: 1,
    key: entry.key,
    createdAt: entry.createdAt,
    payload: {
      category_id: data.category_id,
      all_products: data.all_products,
      type: data.type,
      adjust_type: data.adjust_type,
      value: data.value,
    },
  };
};

export const savePendingPriceAdjustment = (scope: string, entry: PendingPriceAdjustment): void => {
  const raw = JSON.stringify(entry);
  localStorage.setItem(storageKey(scope), raw);
  if (localStorage.getItem(storageKey(scope)) !== raw) throw invalidRecord();
};

export const clearPendingPriceAdjustment = (scope: string, operationKey: string): void => {
  const existing = readPendingPriceAdjustment(scope);
  if (!existing || existing.key !== operationKey) return;
  localStorage.removeItem(storageKey(scope));
  if (localStorage.getItem(storageKey(scope)) !== null) throw invalidRecord();
};
