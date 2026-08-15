/**
 * ذاكرة تخزين مؤقت في الذاكرة مع انتهاء صلاحية وإبطال بالوسوم (tags).
 */
class InMemoryCache {
  cache;
  constructor() {
    this.cache = /* @__PURE__ */ new Map();
  }
  /**
   * جلب قيمة مخزنة (تُحذف تلقائيًا عند انتهاء صلاحيتها).
   * @param {string} key المفتاح
   * @returns {any} القيمة أو null
   */
  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.value;
  }
  /**
   * تخزين قيمة مع مدة صلاحية اختيارية ووسوم للإبطال الجماعي.
   * @param {string} key المفتاح
   * @param {any} value القيمة
   * @param {number} [ttlMs] مدة الصلاحية بالملي ثانية (0 = دائم)
   * @param {string[]} [tags] وسوم للإبطال الجماعي
   */
  set(key: string, value: any, ttlMs = 0, tags: string[] = []) {
    const expiresAt = ttlMs > 0 ? Date.now() + ttlMs : null;
    this.cache.set(key, { value, expiresAt, tags });
  }
  /**
   * حذف كل القيم المرتبطة بوسم معين.
   * @param {string} tag الوسم
   */
  invalidateByTag(tag) {
    for (const [key, entry] of this.cache.entries()) {
      if (entry.tags && entry.tags.includes(tag)) {
        this.cache.delete(key);
      }
    }
  }
  /**
   * مسح كل القيم المخزنة.
   */
  clear() {
    this.cache.clear();
  }
}
/** المثيل المشترك للذاكرة المؤقتة المستخدم في كامل التطبيق. */
const appCache = new InMemoryCache();
export { appCache };
