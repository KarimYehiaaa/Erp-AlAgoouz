import axios from 'axios';
import * as Sentry from '@sentry/vue';
import type { AxiosError, AxiosRequestConfig } from 'axios';
import type { ApiEnvelope } from '../../../shared/types';
import { getManagerOverride, OVERRIDE_HEADER_NAME } from '@/services/managerOverride';

export const CLOUD_SERVER_URL = 'https://agoouz.vercel.app';

export const getBaseServerUrl = (): string => {
  if (typeof window === 'undefined') return '';
  const saved = localStorage.getItem('binalagoouz_server_url');
  if (saved && (saved.startsWith('http://') || saved.startsWith('https://'))) {
    return saved.replace(/\/+$/, '');
  }

  const isCapacitor =
    !!(window as any).Capacitor?.isNativePlatform?.() ||
    window.location.protocol === 'capacitor:' ||
    window.location.protocol === 'file:';

  if (isCapacitor) {
    return import.meta.env.VITE_API_URL || CLOUD_SERVER_URL;
  }
  return import.meta.env.VITE_API_URL || '';
};

export const setBaseServerUrl = (url: string) => {
  if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
    localStorage.removeItem('binalagoouz_server_url');
  } else {
    localStorage.setItem('binalagoouz_server_url', url.replace(/\/+$/, ''));
  }
};

const api = axios.create({
  baseURL: `${getBaseServerUrl()}/api/v1`,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
  },
});

// دعم المصادقة المزدوجة (Hybrid Authentication):
// 1. HttpOnly cookies للأمان ضد XSS
// 2. Authorization Bearer header كـ fallback قوي لبيئات السحابة والـ Cross-origin
api.interceptors.request.use((config: any) => {
  const base = getBaseServerUrl();
  config.baseURL = `${base ? base : ''}/api/v1`;

  // Browser authentication uses the HttpOnly cookie. Do not read JWTs from
  // localStorage; that storage is accessible to any injected script.
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
  (res: any) => res.data,
  async (err: AxiosError<any>) => {
    const originalRequest: any = err.config;

    // Try to refresh token on 401 (except for login/refresh requests)
    if (
      err.response?.status === 401 &&
      !originalRequest._retry &&
      !originalRequest.url?.includes('/auth/login') &&
      !originalRequest.url?.includes('/auth/refresh')
    ) {
      if (isRefreshing) {
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

      try {
        const base = getBaseServerUrl();
        const currentBase = `${base ? base : ''}/api/v1`;
        api.defaults.baseURL = currentBase;
        await axios.post(
          `${currentBase}/auth/refresh`,
          {},
          {
            withCredentials: true,
            headers: { 'Content-Type': 'application/json' },
          },
        );
        // Refresh rotates the HttpOnly cookie. The response token remains
        // available to native clients, but is never copied into web storage.
        processQueue(null, null);
        return api.request(originalRequest);
      } catch (refreshErr: any) {
        processQueue(refreshErr, null);
        // فشل التجديد — مسح الجلسة وإعادة التوجيه (replace بدل href لتجنّب تلويث التاريخ)
        localStorage.removeItem('user');
        localStorage.removeItem('token');
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

// ─── مساعدات مُنمّطة ──────────────────────────────────────────────────────────
// المعترض أعلاه يفكّ الاستجابة (يعيد res.data) — هذه الدوال تعكس ذلك في النظام النوعي
// بحيث تُعيد Promise<ApiEnvelope<T>> بدل Promise<AxiosResponse> المضلِّل.
export type Api<T = any> = Promise<ApiEnvelope<T>>;

export const get = <T = any>(url: string, config?: AxiosRequestConfig): Api<T> =>
  api.get(url, config) as unknown as Api<T>;

export const post = <T = any>(url: string, data?: unknown, config?: AxiosRequestConfig): Api<T> =>
  api.post(url, data, config) as unknown as Api<T>;

export const put = <T = any>(url: string, data?: unknown, config?: AxiosRequestConfig): Api<T> =>
  api.put(url, data, config) as unknown as Api<T>;

export const patch = <T = any>(url: string, data?: unknown, config?: AxiosRequestConfig): Api<T> =>
  api.patch(url, data, config) as unknown as Api<T>;

export const del = <T = any>(url: string, config?: AxiosRequestConfig): Api<T> =>
  api.delete(url, config) as unknown as Api<T>;

/** طلب ملف ثنائي — المعترض يعيد Blob مباشرة عند responseType: 'blob'. */
export const getBlob = (url: string, config?: AxiosRequestConfig): Promise<Blob> =>
  api.get(url, { ...config, responseType: 'blob' }) as unknown as Promise<Blob>;

/** رفع ملف multipart. */
export const uploadFile = <T = any>(url: string, file: File, fieldName = 'file'): Api<T> => {
  const form = new FormData();
  form.append(fieldName, file);
  return api.post(url, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }) as unknown as Api<T>;
};

export default api;
