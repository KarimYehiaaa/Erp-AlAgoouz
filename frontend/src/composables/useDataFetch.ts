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
import type { Ref } from 'vue';
import { useAppStore } from '@/stores/app';

// Cache مشترك بين جميع الـ composables في الجلسة
const _cache = new Map<string, { data: any; ts: number }>();

export interface UseDataFetchOptions {
  cacheKey?: string | null;
  cacheTtlMs?: number;
  immediate?: boolean;
  watchRefresh?: boolean;
  params?: any | Ref<any>;
}

export function useDataFetch<T = any>(fetcher: (params?: any) => Promise<any>, options: UseDataFetchOptions = {}) {
  const {
    cacheKey = null,
    cacheTtlMs = 60_000,
    immediate = true,
    watchRefresh = true,
    params = null,
  } = options;

  const appStore = useAppStore();

  const data = ref<T | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const lastFetchedAt = ref<number | null>(null);

  // ─── Cache Helpers ─────────────────────────────────────────────
  const getCacheKey = (): string | null => {
    if (!cacheKey) return null;
    const p = isRef(params) ? params.value : params;
    if (p && typeof p === 'object') {
      return `${cacheKey}::${JSON.stringify(p)}`;
    }
    return cacheKey;
  };

  const readCache = (): T | null => {
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

  const writeCache = (value: T) => {
    const key = getCacheKey();
    if (!key) return;
    _cache.set(key, { data: value, ts: Date.now() });
  };

  // ─── Fetch ─────────────────────────────────────────────────────
  const fetch = async ({ silent = false } = {}) => {
    // stale-while-revalidate: لو في cache اعرضه فوراً وجلب الجديد خلفياً
    const cached = readCache();
    if (cached !== null) {
      data.value = cached as any;
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
    } catch (err: any) {
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
  const invalidateCache = (keyPattern: string | null = null) => {
    if (!keyPattern) {
      _cache.clear();
      return;
    }
    for (const k of _cache.keys()) {
      if (k.startsWith(keyPattern)) _cache.delete(k);
    }
  };

  // ─── Watchers ──────────────────────────────────────────────────
  let stopRefreshWatcher: (() => void) | null = null;

  onMounted(() => {
    if (immediate) fetch();

    if (watchRefresh) {
      stopRefreshWatcher = watch(
        () => appStore.dataRefreshTrigger,
        () => refresh(),
      );
    }

    if (params && isRef(params)) {
      watch(
        params,
        () => {
          const key = getCacheKey();
          if (key) _cache.delete(key);
          fetch();
        },
        { deep: true },
      );
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
export function clearDataCache(keyPattern: string | null = null) {
  if (!keyPattern) {
    _cache.clear();
    return;
  }
  for (const k of _cache.keys()) {
    if (k.startsWith(keyPattern)) _cache.delete(k);
  }
}

