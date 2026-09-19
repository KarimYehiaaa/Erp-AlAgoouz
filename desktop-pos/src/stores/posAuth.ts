import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api } from '../services/api';
import { getServerUrl } from '../services/config';

export const usePosAuthStore = defineStore('posAuth', () => {
  const user = ref<any>(
    typeof localStorage !== 'undefined' ? JSON.parse(localStorage.getItem('pos_user') || 'null') : null
  );
  const token = ref<string | null>(
    typeof localStorage !== 'undefined' ? localStorage.getItem('pos_token') : null
  );
  const terminal = ref<any>(
    typeof localStorage !== 'undefined' ? JSON.parse(localStorage.getItem('pos_terminal') || 'null') : null
  );
  const sessionInitializing = ref(false);

  const isAuthenticated = computed(() => !sessionInitializing.value && !!token.value && !!user.value);
  const isCashier = computed(() => user.value?.role_name === 'cashier' || user.value?.role_name === 'admin');

  /**
   * استعادة جلسة العمل بأمان عند إقلاع التطبيق (Startup Session Restoration)
   * تقرأ الجلسة المشفرة من safeStorage في Electron إن وُجدت، وتتحقق من قبول الخادم المركزي
   */
  const restoreSession = async (): Promise<boolean> => {
    sessionInitializing.value = true;
    try {
      // 1. محاولة استعادة الجلسة المشفرة من Electron safeStorage
      if (typeof window !== 'undefined' && window.electronAPI?.loadSecureSession) {
        try {
          const secureSession = await window.electronAPI.loadSecureSession();
          if (secureSession && secureSession.token) {
            token.value = secureSession.token;
            user.value = secureSession.user;
            if (secureSession.terminal) {
              terminal.value = secureSession.terminal;
            }
            // تطهير التوكن النصي من localStorage بعد الترحيل لمخزن آمن
            if (typeof localStorage !== 'undefined') {
              localStorage.removeItem('pos_token');
            }
          }
        } catch (loadErr) {
          console.warn('[PosAuth] Failed to load secure session from Electron:', loadErr);
        }
      }

      if (!token.value) {
        return false;
      }

      // 2. التحقق من قبول Electron ومحرك المزامنة للجلسة وعنوان الخادم المعتمد
      if (typeof window !== 'undefined' && window.electronAPI?.setAuthToken) {
        const validatedUrl = getServerUrl();
        const sessionRes = await window.electronAPI.setAuthToken(token.value, validatedUrl);

        if (!sessionRes || !sessionRes.success) {
          console.warn('[PosAuth] Session restoration rejected by Electron:', sessionRes?.error);
          token.value = null;
          user.value = null;
          if (typeof localStorage !== 'undefined') {
            localStorage.removeItem('pos_token');
            localStorage.removeItem('pos_user');
          }
          if (window.electronAPI?.clearSecureSession) {
            await window.electronAPI.clearSecureSession();
          }
          return false;
        }
      }

      return !!token.value && !!user.value;
    } catch (err: any) {
      console.error('[PosAuth] Session restoration exception:', err);
      token.value = null;
      user.value = null;
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('pos_token');
        localStorage.removeItem('pos_user');
      }
      if (typeof window !== 'undefined' && window.electronAPI?.clearSecureSession) {
        await window.electronAPI.clearSecureSession();
      }
      return false;
    } finally {
      sessionInitializing.value = false;
    }
  };

  const login = async (credentials: { username: string; password: string }) => {
    const res = await api.post('/auth/login', credentials);
    const payload = res.data?.data || res.data;
    if (res.data?.success && payload?.token) {
      const serverUrl = getServerUrl();

      // تهيئة الجلسة ذرّياً مع محرك المزامنة
      if (typeof window !== 'undefined' && window.electronAPI?.setAuthToken) {
        const sessionRes = await window.electronAPI.setAuthToken(payload.token, serverUrl);
        if (sessionRes && !sessionRes.success) {
          token.value = null;
          user.value = null;
          if (typeof localStorage !== 'undefined') {
            localStorage.removeItem('pos_token');
            localStorage.removeItem('pos_user');
          }
          if (window.electronAPI?.clearSecureSession) {
            await window.electronAPI.clearSecureSession();
          }
          throw new Error(sessionRes.error || 'فشلت تهيئة جلسة المزامنة لأسباب أمنية');
        }
      }

      token.value = payload.token;
      user.value = payload.user;

      // حفظ الجلسة المشفرة عبر safeStorage في Electron
      if (typeof window !== 'undefined' && window.electronAPI?.saveSecureSession) {
        await window.electronAPI.saveSecureSession({
          token: payload.token,
          user: payload.user,
          terminal: payload.terminal || terminal.value,
        });
        // إزالة التوكن غير المشفر من localStorage لمنع بقائه مكشوفاً
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem('pos_token');
          localStorage.setItem('pos_user', JSON.stringify(payload.user));
        }
      } else if (typeof localStorage !== 'undefined') {
        // Fallback في بيئة المتصفح العادي
        localStorage.setItem('pos_token', payload.token);
        localStorage.setItem('pos_user', JSON.stringify(payload.user));
      }

      return payload;
    }
    throw new Error(res.data?.message || 'اسم المستخدم أو كلمة المرور غير صحيحة');
  };

  const logout = async () => {
    token.value = null;
    user.value = null;

    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('pos_token');
      localStorage.removeItem('pos_user');
    }

    if (typeof window !== 'undefined' && window.electronAPI) {
      if (window.electronAPI.clearSecureSession) {
        await window.electronAPI.clearSecureSession();
      }
      if (window.electronAPI.setAuthToken) {
        await window.electronAPI.setAuthToken(null);
      }
    }
  };

  return {
    user,
    token,
    terminal,
    sessionInitializing,
    isAuthenticated,
    isCashier,
    restoreSession,
    login,
    logout,
  };
});
