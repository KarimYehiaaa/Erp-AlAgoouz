/**
 * useDataFetch — composable عام لجلب البيانات مع caching وإدارة الحالة
 *
 * المميزات:
 * - in-memory cache (Map) تعيش طول الجلسة
 * - stale-while-revalidate: يعرض البيانات القديمة فوراً ثم يجلب الجديدة خلفياً
 * - auto-refresh عند triggerDataRefresh من appStore
 * - loading / error / data state موحدة
 * - دعم params ديناميكية (reactive)
 */
import { ref, watch, onMounted, onUnmounted, isRef, computed } from 'vue';
import { useAppStore } from '@/stores/app';

// Cache مشترك بين جميع الـ composables في الجلسة
const _cache = new Map();

/**
 * @param {Function} fetcher - الدالة التي تستدعي الـ API وترجع Promise
 * @param {Object} options
 * @param {string}  options.cacheKey     - مفتاح الـ cache (اختياري، لو فاضي مش هيعمل cache)
 * @param {number}  options.cacheTtlMs   - مدة صلاحية الـ cache بالميلي ثانية (افتراضي: 60000 = دقيقة)
 * @param {boolean} options.immediate    - هل يجلب البيانات فور التثبيت؟ (افتراضي: true)
 * @param {boolean} options.watchRefresh - هل يستمع لـ dataRefreshTrigger من الـ store؟ (افتراضي: true)
 * @param {Ref|ComputedRef} options.params - params ديناميكية، لو اتغيرت يعيد الجلب تلقائياً
 */
export function useDataFetch(fetcher, options = {}) {
  const {
    cacheKey = null,
    cacheTtlMs = 60_000,
    immediate = true,
    watchRefresh = true,
    params = null,
  } = options;

  const appStore = useAppStore();

  const data = ref(null);
  const loading = ref(false);
  const error = ref(null);
  const lastFetchedAt = ref(null);

  // ─── Cache Helpers ─────────────────────────────────────────────
  const getCacheKey = () => {
    if (!cacheKey) return null;
    const p = isRef(params) ? params.value : params;
    if (p && typeof p === 'object') {
      return `${cacheKey}::${JSON.stringify(p)}`;
    }
    return cacheKey;
  };

  const readCache = () => {
    const key = getCacheKey();
    if (!key) return null;
    const entry = _cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > cacheTtlMs) {
      _cache.delete(key);
      return null;
    }
    return entry.data;
  };

  const writeCache = (value) => {
    const key = getCacheKey();
    if (!key) return;
    _cache.set(key, { data: value, ts: Date.now() });
  };

  // ─── Fetch ─────────────────────────────────────────────────────
  const fetch = async ({ silent = false } = {}) => {
    // stale-while-revalidate: لو في cache اعرضه فوراً وجلب الجديد خلفياً
    const cached = readCache();
    if (cached !== null) {
      data.value = cached;
      if (!silent) loading.value = false;
      // جلب خلفي (بدون loading spinner)
      _fetchFromServer({ silent: true });
      return;
    }

    if (!silent) {
      loading.value = true;
      error.value = null;
    }

    await _fetchFromServer({ silent });
  };

  const _fetchFromServer = async ({ silent = false } = {}) => {
    try {
      const p = isRef(params) ? params.value : params;
      const result = await fetcher(p);
      data.value = result;
      lastFetchedAt.value = Date.now();
      writeCache(result);
      error.value = null;
    } catch (err) {
      if (!silent) {
        error.value = err?.message || 'حدث خطأ في جلب البيانات';
      }
    } finally {
      if (!silent) {
        loading.value = false;
      }
    }
  };

  /** مسح الـ cache يدوياً وإعادة الجلب */
  const refresh = () => {
    const key = getCacheKey();
    if (key) _cache.delete(key);
    return fetch();
  };

  /** مسح كل الـ cache (يُستخدم بعد عمليات الكتابة) */
  const invalidateCache = (keyPattern = null) => {
    if (!keyPattern) {
      _cache.clear();
      return;
    }
    for (const k of _cache.keys()) {
      if (k.startsWith(keyPattern)) _cache.delete(k);
    }
  };

  // ─── Watchers ──────────────────────────────────────────────────
  let stopRefreshWatcher = null;

  onMounted(() => {
    if (immediate) fetch();

    if (watchRefresh) {
      stopRefreshWatcher = watch(
        () => appStore.dataRefreshTrigger,
        () => refresh(),
      );
    }

    if (params && isRef(params)) {
      watch(params, () => {
        const key = getCacheKey();
        if (key) _cache.delete(key);
        fetch();
      }, { deep: true });
    }
  });

  onUnmounted(() => {
    stopRefreshWatcher?.();
  });

  return {
    data,
    loading,
    error,
    lastFetchedAt,
    fetch,
    refresh,
    invalidateCache,
  };
}

/** مسح الـ cache بالكامل (يُستدعى من أي مكان بعد عمليات الحذف/الإضافة) */
export function clearDataCache(keyPattern = null) {
  if (!keyPattern) {
    _cache.clear();
    return;
  }
  for (const k of _cache.keys()) {
    if (k.startsWith(keyPattern)) _cache.delete(k);
  }
}
