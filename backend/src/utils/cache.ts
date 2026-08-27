/**
 * ذاكرة تخزين مؤقت في الذاكرة مع انتهاء صلاحية، إبطال بالوسوم (tags)،
 * حد أقصى LRU لمنع النمو غير المقيّد، ومسح دوري للمدخلات المنتهية.
 */
class InMemoryCache {
  cache;
  tagIndex;
  maxSize;
  sweepIntervalMs;
  lastSweepAt;

  constructor() {
    this.cache = new Map();
    this.tagIndex = new Map();
    this.maxSize = 2000;
    this.sweepIntervalMs = 60 * 1000;
    this.lastSweepAt = Date.now();
  }

  /**
   * تسجيل مفتاح تحت وسومه للإبطال السريع O(1).
   */
  #indexTags(key, tags) {
    for (const tag of tags) {
      let keys = this.tagIndex.get(tag);
      if (!keys) {
        keys = new Set();
        this.tagIndex.set(tag, keys);
      }
      keys.add(key);
    }
  }

  #unindexTags(key, tags) {
    for (const tag of tags || []) {
      const keys = this.tagIndex.get(tag);
      if (keys) {
        keys.delete(key);
        if (keys.size === 0) this.tagIndex.delete(tag);
      }
    }
  }

  /**
   * حذف المدخلات المنتهية دورياً — يُستدعى عند الكتابة كل دقيقة كحد أقصى.
   */
  #sweepIfNeeded() {
    const now = Date.now();
    if (now - this.lastSweepAt < this.sweepIntervalMs) return;
    this.lastSweepAt = now;
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt && now > entry.expiresAt) {
        this.cache.delete(key);
        this.#unindexTags(key, entry.tags);
      }
    }
  }

  /**
   * جلب قيمة مخزنة (تُحدّث موضعها لغرض LRU وتُحذف تلقائيًا عند انتهاء صلاحيتها).
   * @param {string} key المفتاح
   * @returns {any} القيمة أو null
   */
  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.#unindexTags(key, entry.tags);
      return null;
    }
    // تحديث موضع LRU
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  /**
   * تخزين قيمة مع مدة صلاحية اختيارية ووسوم للإبطال الجماعي.
   * @param {string} key المفتاح
   * @param {any} value القيمة
   * @param {number} [ttlMs] مدة الصلاحية بالملي ثانية (0 = حتى المسح/الإبطال)
   * @param {string[]} [tags] وسوم للإبطال الجماعي
   */
  set(key: string, value: any, ttlMs = 3600 * 1000, tags: string[] = []) {
    // قيمة افتراضية بدل "دائم" لمنع التراكم غير المحدود
    const expiresAt = Date.now() + (ttlMs > 0 ? ttlMs : 3600 * 1000);
    const existing = this.cache.get(key);
    if (existing) this.#unindexTags(key, existing.tags);
    this.cache.delete(key); // لإعادة الإدراج في نهاية الخريطة (LRU)
    this.cache.set(key, { value, expiresAt, tags });
    this.#indexTags(key, tags);

    // إخلاء الأقدم إذا تجاوز الحد الأقصى
    while (this.cache.size > this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      const oldest = this.cache.get(oldestKey);
      this.cache.delete(oldestKey);
      this.#unindexTags(oldestKey, oldest?.tags);
    }

    this.#sweepIfNeeded();
  }

  /**
   * حذف كل القيم المرتبطة بوسم معين.
   * @param {string} tag الوسم
   */
  invalidateByTag(tag) {
    const keys = this.tagIndex.get(tag);
    if (!keys) return;
    for (const key of keys) {
      const entry = this.cache.get(key);
      this.cache.delete(key);
      if (entry) this.#unindexTags(key, entry.tags);
    }
    this.tagIndex.delete(tag);
  }

  /**
   * مسح كل القيم المخزنة.
   */
  clear() {
    this.cache.clear();
    this.tagIndex.clear();
  }
}
/** المثيل المشترك للذاكرة المؤقتة المستخدم في كامل التطبيق. */
const appCache = new InMemoryCache();
/** إبطال وسوم الكاش المشتركة (تقارير P&L وتكاليف المنتجات). */
export const invalidateAppCacheTags = () => {
  appCache.invalidateByTag('pl_report');
  appCache.invalidateByTag('product_cost');
};
export { appCache };
