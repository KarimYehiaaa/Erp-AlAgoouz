import axios from 'axios';
import * as Sentry from '@sentry/vue';
import type { AxiosError } from 'axios';

const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL || ''}/api/v1`,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
  },
});

api.interceptors.request.use((config: any) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
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
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api.request(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const res = await axios.post(
          `${api.defaults.baseURL}/auth/refresh`,
          {},
          {
            withCredentials: true,
            headers: { 'Content-Type': 'application/json' },
          },
        );
        const { token: newToken } = res.data?.data || res.data || {};
        if (newToken) {
          localStorage.setItem('token', newToken);
          api.defaults.headers.common.Authorization = `Bearer ${newToken}`;
          processQueue(null, newToken);
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return api.request(originalRequest);
        }
      } catch (refreshErr: any) {
        processQueue(refreshErr, null);
        // Refresh failed — clear tokens and redirect (replace بدل href لتجنّب تلويث التاريخ)
        localStorage.removeItem('token');
        localStorage.removeItem('user');
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

export default api;
