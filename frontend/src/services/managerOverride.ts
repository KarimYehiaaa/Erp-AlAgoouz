/**
 * managerOverride.ts — تخزين توكن تجاوز المدير (Server-Side Manager Override)
 * يُصدره الخادم بعد نجاح /pos/verify-pin ويُرفق تلقائيًا في ترويسة
 * X-Manager-Override للطلبات الحساسة (الإرجاع، الخصم الكبير).
 * التوكن قصير الأجل (10 دقائق) وينتهي تلقائيًا — لا يُخزَّن في localStorage.
 */

let overrideToken: string | null = null;
let expiresAt = 0;

const OVERRIDE_HEADER = 'X-Manager-Override';

/** حفظ توكن التجاوز بعد نجاح التحقق من PIN. */
export const setManagerOverride = (token: string, expiresIn: number) => {
  overrideToken = token;
  expiresAt = Date.now() + expiresIn * 1000 - 5_000; // هامش أمان 5 ثوانٍ
};

/** التوكن الفعّال حاليًا أو null إذا انتهى. */
export const getManagerOverride = (): string | null => {
  if (!overrideToken) return null;
  if (Date.now() > expiresAt) {
    clearManagerOverride();
    return null;
  }
  return overrideToken;
};

/** مسح التوكن (عند الاستهلاك أو الرفض أو الخروج). */
export const clearManagerOverride = () => {
  overrideToken = null;
  expiresAt = 0;
};

export const OVERRIDE_HEADER_NAME = OVERRIDE_HEADER;
