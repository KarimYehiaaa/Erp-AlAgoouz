import axios, { type AxiosRequestConfig, type AxiosError } from 'axios';
import { getServerUrl, DEFAULT_SERVER_URL } from './serverUrlPolicy';
import { sessionService } from './sessionService';
import { getBrowserQueueContext } from './browserQueue';
import { consumeManagerOverrideToken, MANAGER_OVERRIDE_HEADER_NAME } from './managerOverride';

let forceProductionMode: boolean | undefined = undefined;
const currentRequestContext = () =>
  `${getServerUrl(forceProductionMode)}::${sessionService.getUser()?.id ?? 'anonymous'}::${sessionService.getRevision()}`;
const contextChanged = () => ({ status: 409, message: 'تغير الحساب أو السيرفر أثناء الطلب' });
type SessionRequest = AxiosRequestConfig & {
  _retry?: boolean;
  _ipRetry?: boolean;
  _queueContext?: string;
  _sessionContext?: string;
};

export function setApiProductionMode(prod: boolean | undefined) {
  forceProductionMode = prod;
}

export const api = axios.create({
  baseURL: DEFAULT_SERVER_URL,
  timeout: 8000,
  // Desktop authentication is carried by the OS-protected token vault.
  // Browser cookies must not override the selected cashier's bearer token.
  withCredentials: false,
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
  const request = config as typeof config & SessionRequest;
  if (request._sessionContext && request._sessionContext !== currentRequestContext()) {
    return Promise.reject(contextChanged());
  }
  request._sessionContext = currentRequestContext();
  const queueContext = (config as typeof config & { _queueContext?: string })._queueContext;
  if (queueContext && queueContext !== getBrowserQueueContext()) {
    return Promise.reject({ status: 409, message: 'تغير الحساب أو السيرفر قبل إرسال الفواتير' });
  }
  const currentBase = getServerUrl(forceProductionMode);
  config.baseURL =
    (config as typeof config & { _ipRetry?: boolean })._ipRetry &&
    new URL(currentBase).hostname === 'localhost'
      ? currentBase.replace('localhost', '127.0.0.1')
      : currentBase;
  config.withCredentials = false;
  if (config.url?.includes('/auth/login')) {
    config.headers['X-Client-Type'] = 'desktop-pos';
  }

  // جلب التوكن من خدمة الجلسات الآمنة حصراً بدون لمس localStorage
  const token = sessionService.getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  const managerOverride = consumeManagerOverrideToken(config.method || 'GET', config.url || '');
  if (managerOverride) {
    config.headers[MANAGER_OVERRIDE_HEADER_NAME] = managerOverride;
  }

  return config;
});

api.interceptors.response.use(
  (res) =>
    (res.config as SessionRequest)._sessionContext === currentRequestContext()
      ? res
      : Promise.reject(contextChanged()),
  async (err: AxiosError) => {
    const originalRequest = err.config as SessionRequest | undefined;
    if (
      originalRequest?._sessionContext &&
      originalRequest._sessionContext !== currentRequestContext()
    ) {
      return Promise.reject(contextChanged());
    }
    if (
      originalRequest?._queueContext &&
      originalRequest._queueContext !== getBrowserQueueContext()
    ) {
      return Promise.reject(err);
    }

    // معالجة خطأ 401 فقط
    if (err.response?.status === 401 && originalRequest) {
      const isAuthEndpoint =
        originalRequest.url?.includes('/auth/login') ||
        originalRequest.url?.includes('/auth/refresh');

      // إذا كان الخطأ من تسجيل الدخول أو التجديد نفسه، أو تمت محاولة التجديد مسبقاً -> منع التكرار اللانهائي
      if (originalRequest._retry || isAuthEndpoint) {
        const revision = sessionService.getRevision();
        await sessionService.clearSession();
        if (
          sessionService.getRevision() === revision + 1 &&
          typeof window !== 'undefined' &&
          window.location?.hash !== '#/login'
        ) {
          window.location.hash = '#/login';
        }
        return Promise.reject(err);
      }

      // إذا كانت هناك محاولة تجديد جارية بالفعل، يتم تعليق الطلب الحالي حتى تكتمل
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          subscribeTokenRefresh((newToken) => {
            if (originalRequest._sessionContext !== currentRequestContext())
              return reject(contextChanged());
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
      const refreshContext = currentRequestContext();

      try {
        const serverUrl = getServerUrl(forceProductionMode);
        const refreshToken = sessionService.getRefreshToken();

        // محاولة تجديد الجلسة مرة واحدة فقط
        const refreshResponse = await axios.post(
          `${serverUrl}/auth/refresh`,
          refreshToken ? { refreshToken } : {},
          {
            withCredentials: false,
            timeout: 6000,
            headers: {
              'Content-Type': 'application/json',
              'X-Client-Type': 'desktop-pos',
              ...(refreshToken ? { 'x-refresh-token': refreshToken } : {}),
            },
          },
        );

        const payload = refreshResponse.data?.data;
        const newAccessToken = payload?.token;
        if (refreshContext !== currentRequestContext()) throw contextChanged();

        if (refreshResponse.data?.success && newAccessToken) {
          // تحديث الجلسة الآمنة
          await sessionService.updateTokens(newAccessToken, payload?.refreshToken);
          if (refreshContext !== currentRequestContext()) throw contextChanged();

          // تحديث محرك المزامنة في Electron
          if (typeof window !== 'undefined' && window.electronAPI?.setAuthToken) {
            await window.electronAPI.setAuthToken(newAccessToken, serverUrl);
          }
          if (refreshContext !== currentRequestContext()) throw contextChanged();

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
        if (refreshContext !== currentRequestContext()) return Promise.reject(refreshErr);
        const revision = sessionService.getRevision();
        await sessionService.clearSession();
        if (
          sessionService.getRevision() === revision + 1 &&
          typeof window !== 'undefined' &&
          window.location?.hash !== '#/login'
        ) {
          window.location.hash = '#/login';
        }
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }

    // إعادة المحاولة التلقائية عند فشل الاتصال بـ localhost للتحويل إلى 127.0.0.1
    if (
      (err.code === 'ERR_NETWORK' || !err.response) &&
      originalRequest &&
      !originalRequest._ipRetry
    ) {
      const urlStr = originalRequest.baseURL || originalRequest.url || '';
      if (urlStr.includes('localhost')) {
        originalRequest._ipRetry = true;
        if (originalRequest.url) {
          originalRequest.url = originalRequest.url.replace('localhost', '127.0.0.1');
        }
        return api(originalRequest);
      }
    }

    return Promise.reject(err);
  },
);
