import axios, { type AxiosRequestConfig, type AxiosError } from 'axios';
import { getServerUrl, DEFAULT_SERVER_URL } from './serverUrlPolicy';
import { sessionService } from './sessionService';

let forceProductionMode: boolean | undefined = undefined;

export function setApiProductionMode(prod: boolean | undefined) {
  forceProductionMode = prod;
}

export const api = axios.create({
  baseURL: DEFAULT_SERVER_URL,
  timeout: 8000,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// متغيرات التحكم في تجديد التوكن وطابور الطلبات المتزامنة
let isRefreshing = false;
let refreshSubscribers: Array<(token: string | null) => void> = [];

function subscribeTokenRefresh(cb: (token: string | null) => void) {
  refreshSubscribers.push(cb);
}

function onRefreshed(newToken: string | null) {
  refreshSubscribers.forEach((cb) => cb(newToken));
  refreshSubscribers = [];
}

api.interceptors.request.use((config) => {
  const isProd =
    forceProductionMode !== undefined ? forceProductionMode : ((import.meta as any).env?.PROD ?? false);
  const currentBase = getServerUrl(isProd);
  config.baseURL = currentBase;
  config.withCredentials = true;

  // جلب التوكن من خدمة الجلسات الآمنة حصراً بدون لمس localStorage
  const token = sessionService.getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (err: AxiosError) => {
    const originalRequest = err.config as (AxiosRequestConfig & { _retry?: boolean }) | undefined;

    // معالجة خطأ 401 فقط
    if (err.response?.status === 401 && originalRequest) {
      const isAuthEndpoint =
        originalRequest.url?.includes('/auth/login') ||
        originalRequest.url?.includes('/auth/refresh');

      // إذا كان الخطأ من تسجيل الدخول أو التجديد نفسه، أو تمت محاولة التجديد مسبقاً -> منع التكرار اللانهائي
      if (originalRequest._retry || isAuthEndpoint) {
        await sessionService.clearSession();
        if (typeof window !== 'undefined' && window.location?.hash !== '#/login') {
          window.location.hash = '#/login';
        }
        return Promise.reject(err);
      }

      // إذا كانت هناك محاولة تجديد جارية بالفعل، يتم تعليق الطلب الحالي حتى تكتمل
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          subscribeTokenRefresh((newToken) => {
            if (newToken && originalRequest.headers) {
              originalRequest._retry = true;
              originalRequest.headers.Authorization = `Bearer ${newToken}`;
              resolve(api(originalRequest));
            } else {
              reject(err);
            }
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const isProd =
          forceProductionMode !== undefined ? forceProductionMode : ((import.meta as any).env?.PROD ?? false);
        const serverUrl = getServerUrl(isProd);
        const refreshToken = sessionService.getRefreshToken();

        // محاولة تجديد الجلسة مرة واحدة فقط
        const refreshResponse = await axios.post(
          `${serverUrl}/auth/refresh`,
          refreshToken ? { refreshToken } : {},
          {
            withCredentials: true,
            timeout: 6000,
            headers: {
              'Content-Type': 'application/json',
              ...(refreshToken ? { 'x-refresh-token': refreshToken } : {}),
            },
          }
        );

        const payload = refreshResponse.data?.data;
        const newAccessToken = payload?.token;

        if (refreshResponse.data?.success && newAccessToken) {
          // تحديث الجلسة الآمنة
          await sessionService.updateTokens(newAccessToken, payload?.refreshToken);

          // تحديث محرك المزامنة في Electron
          if (typeof window !== 'undefined' && window.electronAPI?.setAuthToken) {
            await window.electronAPI.setAuthToken(newAccessToken, serverUrl);
          }

          onRefreshed(newAccessToken);

          // إعادة تنفيذ الطلب الأصلي بتوكن الوصول الجديد
          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
          }
          return api(originalRequest);
        } else {
          throw new Error('Refresh response lacked valid access token');
        }
      } catch (refreshErr) {
        onRefreshed(null);
        await sessionService.clearSession();
        if (typeof window !== 'undefined' && window.location?.hash !== '#/login') {
          window.location.hash = '#/login';
        }
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(err);
  }
);
