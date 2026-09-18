import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api } from '../services/api';
import { getServerUrl } from '../services/config';

export const usePosAuthStore = defineStore('posAuth', () => {
  const user = ref<any>(JSON.parse(localStorage.getItem('pos_user') || 'null'));
  const token = ref<string | null>(localStorage.getItem('pos_token'));
  const terminal = ref<any>(JSON.parse(localStorage.getItem('pos_terminal') || 'null'));
  const sessionInitializing = ref(false);

  const isAuthenticated = computed(() => !sessionInitializing.value && !!token.value && !!user.value);
  const isCashier = computed(() => user.value?.role_name === 'cashier' || user.value?.role_name === 'admin');

  /**
   * استعادة جلسة العمل بأمان عند إقلاع التطبيق (Startup Session Restoration)
   * تضمن التحقق من قبول Electron للجلسة وعنوان الخادم المعتمد قبل اعتبار المستخدم مسجلاً
   */
  const restoreSession = async (): Promise<boolean> => {
    if (!token.value) {
      return false;
    }

    if (typeof window !== 'undefined' && window.electronAPI?.setAuthToken) {
      sessionInitializing.value = true;
      try {
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
          return false;
        }
      } catch (err: any) {
        console.error('[PosAuth] Session restoration exception:', err);
        token.value = null;
        user.value = null;
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem('pos_token');
          localStorage.removeItem('pos_user');
        }
        return false;
      } finally {
        sessionInitializing.value = false;
      }
    }

    return !!token.value && !!user.value;
  };

  const login = async (credentials: { username: string; password: string }) => {
    const res = await api.post('/auth/login', credentials);
    const payload = res.data?.data || res.data;
    if (res.data?.success && payload?.token) {
      if (window.electronAPI?.setAuthToken) {
        const sessionRes = await window.electronAPI.setAuthToken(payload.token, getServerUrl());
        if (sessionRes && !sessionRes.success) {
          // Atomic failure: rollback and abort login
          token.value = null;
          user.value = null;
          localStorage.removeItem('pos_token');
          localStorage.removeItem('pos_user');
          throw new Error(sessionRes.error || 'فشلت تهيئة جلسة المزامنة لأسباب أمنية');
        }
      }

      token.value = payload.token;
      user.value = payload.user;
      localStorage.setItem('pos_token', payload.token);
      localStorage.setItem('pos_user', JSON.stringify(payload.user));

      return payload;
    }
    throw new Error(res.data?.message || 'اسم المستخدم أو كلمة المرور غير صحيحة');
  };

  const logout = () => {
    token.value = null;
    user.value = null;
    localStorage.removeItem('pos_token');
    localStorage.removeItem('pos_user');

    if (window.electronAPI?.setAuthToken) {
      window.electronAPI.setAuthToken(null);
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
