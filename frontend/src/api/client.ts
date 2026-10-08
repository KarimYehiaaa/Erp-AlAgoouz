import axios from 'axios';
import * as Sentry from '@sentry/vue';
import type { AxiosError, AxiosRequestConfig } from 'axios';
import type { ApiEnvelope } from '../../../shared/types';
import {
  getManagerOverride,
  clearManagerOverride,
  OVERRIDE_HEADER_NAME,
} from '@/services/managerOverride';

export const CLOUD_SERVER_URL = 'https://agoouz.vercel.app';

// Keep the short-lived access token in memory as a fallback for browsers that
// block cross-site cookies (for example local frontend -> cloud API). It is
// deliberately never persisted in localStorage or cookies from JavaScript.
let inMemoryAccessToken: string | null = null;
let serverRevision = 0;

const nativeOriginHeaders = (): Record<string, string> =>
  (window as any).Capacitor?.isNativePlatform?.() ? { Origin: window.location.origin } : {};

// Explicit login/logout boundaries invalidate even a previous session of the same user.
export const invalidateSessionContext = () => {
  serverRevision++;
  setSessionAccessToken(null);
  clearApiCache();
};

export const setSessionAccessToken = (token: string | null) => {
  if (inMemoryAccessToken !== token) clearApiCache();
  if (!token) clearManagerOverride();
  inMemoryAccessToken = token;
};

export const getApiCacheScope = (): string => {
  let userId: string | number = 'anonymous';
  try {
    userId = JSON.parse(localStorage.getItem('user') || 'null')?.id ?? userId;
  } catch {
    /* Malformed cached user metadata is treated as anonymous. */
  }
  return `${getBaseServerUrl() || window.location.origin}::${userId}`;
};

const isNativeRuntime = (): boolean =>
  typeof window !== 'undefined' &&
  (!!(window as any).Capacitor?.isNativePlatform?.() ||
    window.location.protocol === 'capacitor:' ||
    window.location.protocol === 'file:');

const isLocalServerHost = (host: string): boolean => {
  if (['localhost', '127.0.0.1', '[::1]'].includes(host) || host.endsWith('.local')) return true;
  const parts = host.split('.').map(Number);
  return (
    parts.length === 4 &&
    parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) &&
    (parts[0] === 10 ||
      (parts[0] === 192 && parts[1] === 168) ||
      (parts[0] === 172 && parts[1]! >= 16 && parts[1]! <= 31))
  );
};

const isTrustedHttpsOrigin = (parsed: URL): boolean => {
  if (isLocalServerHost(parsed.hostname)) return true;
  const candidates = [
    CLOUD_SERVER_URL,
    'https://agoouz-api.vercel.app',
    typeof window !== 'undefined' && !isNativeRuntime() ? window.location.origin : '',
    import.meta.env.VITE_API_URL || '',
    ...(import.meta.env.VITE_TRUSTED_SERVER_URLS || '').split(','),
  ];
  return candidates.some((candidate) => {
    try {
      const trusted = new URL(candidate.trim());
      return (
        trusted.protocol === 'https:' &&
        !trusted.username &&
        !trusted.password &&
        !trusted.search &&
        !trusted.hash &&
        trusted.pathname === '/' &&
        parsed.origin === trusted.origin
      );
    } catch {
      return false;
    }
  });
};

export const isValidServerUrl = (urlStr: string): boolean => {
  if (!urlStr || typeof urlStr !== 'string') return false;
  try {
    const parsed = new URL(urlStr);
    if (
      !parsed.hostname ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      parsed.pathname !== '/'
    )
      return false;
    if (parsed.protocol === 'https:') return isTrustedHttpsOrigin(parsed);
    if (parsed.protocol !== 'http:') return false;
    const host = parsed.hostname;
    if (isNativeRuntime()) {
      // Android Release requires HTTPS; Debug HTTP is limited to the emulator gateway.
      return import.meta.env.VITE_ANDROID_BUILD_TYPE === 'Debug' && host === '10.0.2.2';
    }
    return isLocalServerHost(host);
  } catch {
    return false;
  }
};

export class ServerAddressError extends Error {
  constructor() {
    super(
      isNativeRuntime()
        ? import.meta.env.VITE_ANDROID_BUILD_TYPE === 'Debug'
          ? 'استخدم HTTPS لخادم موثوق، أو بوابة محاكي Android ‏10.0.2.2 في نسخة الاختبار فقط، دون مسار أو بيانات دخول.'
          : 'نسخة الموبايل تتطلب رابط HTTPS لخادم موثوق. استخدم موقع بن العجوز أو السيرفر المحلي، دون مسار أو بيانات دخول.'
        : 'استخدم خادمًا موثوقًا لبن العجوز أو عنوان الشبكة المحلية، دون مسار أو بيانات دخول',
    );
    this.name = 'ServerAddressError';
  }
}

export const assertValidServerUrl = (url: string): void => {
  if (!isValidServerUrl(url)) throw new ServerAddressError();
};

export const getBaseServerUrl = (): string => {
  if (typeof window === 'undefined') return '';
  const saved = localStorage.getItem('binalagoouz_server_url');
  if (saved && isValidServerUrl(saved)) {
    return saved.replace(/\/+$/, '');
  }

  if (isNativeRuntime()) {
    const configured = import.meta.env.VITE_API_URL || CLOUD_SERVER_URL;
    return isValidServerUrl(configured) ? configured : CLOUD_SERVER_URL;
  }
  const configured = import.meta.env.VITE_API_URL || '';
  return isValidServerUrl(configured) ? configured : '';
};

export const setBaseServerUrl = (url: string) => {
  if (url) assertValidServerUrl(url);
  const previous = getBaseServerUrl() || window.location.origin;
  if (!url || !isValidServerUrl(url)) {
    localStorage.removeItem('binalagoouz_server_url');
    api.defaults.baseURL = `${getBaseServerUrl()}/api/v1`;
  } else {
    const cleanUrl = url.replace(/\/+$/, '');
    localStorage.setItem('binalagoouz_server_url', cleanUrl);
    api.defaults.baseURL = `${cleanUrl}/api/v1`;
  }
  if ((getBaseServerUrl() || window.location.origin) !== previous) {
    serverRevision++;
    setSessionAccessToken(null);
    clearApiCache();
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    localStorage.removeItem('binalagoouz_cached_summary');
    localStorage.removeItem('binalagoouz_cached_inventory');
    window.dispatchEvent(new Event('erp:server-changed'));
  }
};

const api = axios.create({
  baseURL: `${getBaseServerUrl()}/api/v1`,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// دعم المصادقة المزدوجة (Hybrid Authentication):
// 1. HttpOnly cookies للأمان ضد XSS
// 2. Authorization Bearer header كـ fallback قوي لبيئات السحابة والـ Cross-origin
api.interceptors.request.use((config: any) => {
  if (
    (config._serverRevision !== undefined && config._serverRevision !== serverRevision) ||
    (config._identityScope !== undefined && config._identityScope !== getApiCacheScope())
  ) {
    return Promise.reject(new Error('SERVER_CHANGED'));
  }
  config._serverRevision = serverRevision;
  config._identityScope = getApiCacheScope();
  Object.assign(config.headers, nativeOriginHeaders());
  const base = getBaseServerUrl();
  config.baseURL = `${base ? base : ''}/api/v1`;

  // Browser authentication uses the HttpOnly cookie. Do not read JWTs from
  // localStorage; that storage is accessible to any injected script. The
  // in-memory fallback only covers the current page session when cookies are
  // unavailable across origins.
  if (inMemoryAccessToken && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${inMemoryAccessToken}`;
  }
  // توكن تجاوز المدير (يُصدر من /pos/verify-pin) — يُرفق تلقائيًا للطلبات الحساسة
  const overrideToken = getManagerOverride();
  if (overrideToken && !config.headers[OVERRIDE_HEADER_NAME]) {
    config.headers[OVERRIDE_HEADER_NAME] = overrideToken;
  }
  // إصلاح التجمّد: مهلة لكل طلب — الطلب العالق كان يجمّد الـ router guard للأبد
  config.timeout = config.timeout || 20_000;
  config.timeoutErrorMessage = 'انتهت مهلة الاتصال بالخادم. حاول مرة أخرى';
  return config;
});

// Track refresh state to prevent multiple simultaneous refresh attempts
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (_value: unknown) => void;
  reject: (_reason?: unknown) => void;
}> = [];

const processQueue = (error: any, token: any = null) => {
  failedQueue.forEach((prom: any) => {
    if (error) prom.reject(error);
    else prom.resolve(token);
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (res: any) => {
    if (
      res.config._serverRevision !== serverRevision ||
      res.config._identityScope !== getApiCacheScope()
    ) {
      throw new Error('SESSION_CONTEXT_CHANGED');
    }
    return res.data;
  },
  async (err: AxiosError<any>) => {
    const originalRequest: any = err.config;
    if (
      originalRequest &&
      (originalRequest._serverRevision !== serverRevision ||
        originalRequest._identityScope !== getApiCacheScope())
    ) {
      return Promise.reject({
        message: 'تم تغيير السيرفر؛ أعد الطلب بعد تسجيل الدخول',
        status: 409,
      });
    }

    // Try to refresh token on 401 (except for login/refresh requests)
    if (
      err.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !originalRequest.url?.includes('/auth/login') &&
      !originalRequest.url?.includes('/auth/refresh')
    ) {
      if (isRefreshing) {
        originalRequest._retry = true;
        // Queue this request until refresh completes
        return new Promise((resolve: any, reject: any) => {
          failedQueue.push({ resolve, reject });
        }).then((token: any) => {
          if (token && originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${token}`;
          }
          return api.request(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;
      const refreshRevision = serverRevision;
      const refreshScope = getApiCacheScope();

      try {
        const base = getBaseServerUrl();
        const currentBase = `${base ? base : ''}/api/v1`;
        api.defaults.baseURL = currentBase;
        const refreshResponse = await axios.post(
          `${currentBase}/auth/refresh`,
          {},
          {
            withCredentials: true,
            timeout: 20_000,
            headers: {
              'Content-Type': 'application/json',
              ...nativeOriginHeaders(),
              ...(inMemoryAccessToken ? { Authorization: `Bearer ${inMemoryAccessToken}` } : {}),
            },
          },
        );
        const refreshedToken =
          refreshResponse.data?.data?.token || refreshResponse.data?.token || null;
        if (refreshRevision !== serverRevision || refreshScope !== getApiCacheScope())
          throw new Error('SESSION_CONTEXT_CHANGED');
        if (refreshedToken) {
          setSessionAccessToken(refreshedToken);
          originalRequest.headers.Authorization = `Bearer ${refreshedToken}`;
        }
        // Refresh rotates the HttpOnly cookie. The response token remains
        // available to native clients, but is never copied into web storage.
        processQueue(null, refreshedToken);
        return api.request(originalRequest);
      } catch (refreshErr: any) {
        processQueue(refreshErr, null);
        if (refreshRevision !== serverRevision || refreshScope !== getApiCacheScope())
          return Promise.reject(refreshErr);
        // فشل التجديد — مسح الجلسة وإعادة التوجيه (replace بدل href لتجنّب تلويث التاريخ)
        localStorage.removeItem('user');
        localStorage.removeItem('token');
        setSessionAccessToken(null);
        if (!window.location.pathname.includes('/login')) {
          window.location.replace('/login');
        }
        return Promise.reject({ message: 'انتهت الجلسة. يرجى تسجيل الدخول مرة أخرى', status: 401 });
      } finally {
        isRefreshing = false;
      }
    }

    // Standard error message handling
    let message = err.response?.data?.message;
    if (!message && err.response?.data instanceof Blob) {
      const text = await err.response.data.text().catch(() => '');
      if (text) {
        try {
          message = JSON.parse(text)?.message;
        } catch {
          message = text;
        }
      }
    }
    if (!message) {
      if (err.code === 'ERR_NETWORK' || !err.response) {
        message = 'لا يمكن الاتصال بالخادم. يرجى المحاولة مرة أخرى لاحقاً';
      } else {
        message = 'حدث خطأ في الاتصال';
      }
    }
    if (message?.includes('قاعدة البيانات') || err.response?.status === 503) {
      message = 'الخدمة غير متاحة حالياً. يرجى المحاولة مرة أخرى بعد قليل';
    }

    // Report unhandled backend errors to Sentry
    if (!err.response || err.response.status >= 500) {
      Sentry.captureException(err);
    }

    return Promise.reject({ message, status: err.response?.status });
  },
);

// ─── In-Flight Request Deduplication & Fast Response Cache ──────────────────
const inFlightRequests = new Map<string, Promise<any>>();
const memoryCache = new Map<string, { data: any; expiry: number }>();
let cacheRevision = 0;

const buildRequestKey = (url: string, config?: AxiosRequestConfig): string => {
  const paramsStr = config?.params ? JSON.stringify(config.params) : '';
  return `${getApiCacheScope()}::${cacheRevision}::${url}::${paramsStr}`;
};

export const clearApiCache = () => {
  cacheRevision++;
  memoryCache.clear();
  inFlightRequests.clear();
};

export interface RequestOptions extends AxiosRequestConfig {
  cacheTtlMs?: number;
  skipCache?: boolean;
}

export type Api<T = any> = Promise<ApiEnvelope<T>>;

export const get = <T = any>(url: string, config?: RequestOptions): Api<T> => {
  const requestCacheRevision = cacheRevision;
  const reqKey = buildRequestKey(url, config);
  const now = Date.now();

  // 1. Memory micro-cache check (if configured with TTL, e.g. for warehouses, categories, etc.)
  if (!config?.skipCache && config?.cacheTtlMs && config.cacheTtlMs > 0) {
    const cached = memoryCache.get(reqKey);
    if (cached && cached.expiry > now) {
      return Promise.resolve(cached.data) as unknown as Api<T>;
    }
  }

  // 2. In-flight request deduplication: prevents firing parallel duplicate requests
  if (!config?.skipCache && inFlightRequests.has(reqKey)) {
    return inFlightRequests.get(reqKey) as unknown as Api<T>;
  }

  const promise = (api.get(url, config) as unknown as Api<T>)
    .then((res) => {
      inFlightRequests.delete(reqKey);
      if (requestCacheRevision === cacheRevision && config?.cacheTtlMs && config.cacheTtlMs > 0) {
        memoryCache.set(reqKey, { data: res, expiry: Date.now() + config.cacheTtlMs });
      }
      return res;
    })
    .catch((err) => {
      inFlightRequests.delete(reqKey);
      throw err;
    });

  inFlightRequests.set(reqKey, promise);
  return promise;
};

export const post = <T = any>(url: string, data?: unknown, config?: AxiosRequestConfig): Api<T> => {
  clearApiCache();
  return api.post(url, data, config) as unknown as Api<T>;
};

export const put = <T = any>(url: string, data?: unknown, config?: AxiosRequestConfig): Api<T> => {
  clearApiCache();
  return api.put(url, data, config) as unknown as Api<T>;
};

export const patch = <T = any>(
  url: string,
  data?: unknown,
  config?: AxiosRequestConfig,
): Api<T> => {
  clearApiCache();
  return api.patch(url, data, config) as unknown as Api<T>;
};

export const del = <T = any>(url: string, config?: AxiosRequestConfig): Api<T> => {
  clearApiCache();
  return api.delete(url, config) as unknown as Api<T>;
};

/** طلب ملف ثنائي — المعترض يعيد Blob مباشرة عند responseType: 'blob'. */
export const getBlob = (url: string, config?: AxiosRequestConfig): Promise<Blob> =>
  api.get(url, { ...config, responseType: 'blob' }) as unknown as Promise<Blob>;

export const postBlob = (url: string, data?: unknown, config?: AxiosRequestConfig): Promise<Blob> =>
  api.post(url, data, { ...config, responseType: 'blob' }) as unknown as Promise<Blob>;

/** رفع ملف multipart. */
export const uploadFile = <T = any>(url: string, file: File, fieldName = 'file'): Api<T> => {
  const form = new FormData();
  form.append(fieldName, file);
  return api.post(url, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }) as unknown as Api<T>;
};

export default api;
