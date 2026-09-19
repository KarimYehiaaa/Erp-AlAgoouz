import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api } from '../services/api';
import { getServerUrl } from '../services/config';
import { sessionService } from '../services/sessionService';

export const usePosAuthStore = defineStore('posAuth', () => {
  const user = ref<any>(sessionService.getUser());
  const token = ref<string | null>(sessionService.getAccessToken());
  const terminal = ref<any>(sessionService.getTerminal());
  const sessionInitializing = ref(false);

  const isAuthenticated = computed(() => !sessionInitializing.value && !!token.value && !!user.value);
  const isCashier = computed(() => user.value?.role_name === 'cashier' || user.value?.role_name === 'admin');

  /**
   * استعادة جلسة العمل بأمان عند إقلاع التطبيق (Startup Session Restoration)
   * تقرأ الجلسة المشفرة عبر sessionService وتتحقق من قبول الخادم المركزي ومحرك المزامنة
   */
  const restoreSession = async (): Promise<boolean> => {
    sessionInitializing.value = true;
    sessionService.setSessionInitializing(true);
    try {
      // 1. استعادة الجلسة من التخزين المشفر عبر sessionService
      const secureSession = await sessionService.restoreSession();
      if (secureSession && secureSession.token && secureSession.user) {
        token.value = secureSession.token;
        user.value = secureSession.user;
        if (secureSession.terminal) {
          terminal.value = secureSession.terminal;
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
          terminal.value = null;
          await sessionService.clearSession();
          return false;
        }
      }

      return !!token.value && !!user.value;
    } catch (err: any) {
      console.error('[PosAuth] Session restoration exception:', err);
      token.value = null;
      user.value = null;
      terminal.value = null;
      await sessionService.clearSession();
      return false;
    } finally {
      sessionInitializing.value = false;
      sessionService.setSessionInitializing(false);
    }
  };

  /**
   * تسجيل الدخول الذري (Atomic Login)
   * إذا فشل أي جزء من حفظ الجلسة أو تهيئة المزامنة، يتم التراجع الفوري (Rollback)
   */
  const login = async (credentials: { username: string; password: string }) => {
    const res = await api.post('/auth/login', credentials);
    const payload = res.data?.data || res.data;

    if (res.data?.success && payload?.token) {
      const serverUrl = getServerUrl();

      // الخطوة 1: تهيئة الجلسة ذرّياً مع محرك المزامنة
      if (typeof window !== 'undefined' && window.electronAPI?.setAuthToken) {
        const sessionRes = await window.electronAPI.setAuthToken(payload.token, serverUrl);
        if (sessionRes && !sessionRes.success) {
          token.value = null;
          user.value = null;
          terminal.value = null;
          await sessionService.clearSession();
          throw new Error(sessionRes.error || 'فشلت تهيئة جلسة المزامنة لأسباب أمنية');
        }
      }

      // الخطوة 2: حفظ الجلسة المشفرة عبر sessionService
      const saveOk = await sessionService.saveSession({
        token: payload.token,
        refreshToken: payload.refreshToken,
        user: payload.user,
        terminal: payload.terminal || terminal.value,
        savedAt: new Date().toISOString(),
      });

      if (!saveOk && typeof window !== 'undefined' && window.electronAPI?.saveSecureSession) {
        // فشل الحفظ الآمن في بيئة Electron -> Rollback فوري
        token.value = null;
        user.value = null;
        terminal.value = null;
        await sessionService.clearSession();
        throw new Error('فشل حفظ الجلسة المشفرة بأمان على الجهاز');
      }

      // الخطوة 3: تحديث الحالة التفاعلية فقط بعد نجاح كافة الخطوات الأمنية
      token.value = payload.token;
      user.value = payload.user;
      if (payload.terminal) {
        terminal.value = payload.terminal;
      }

      return payload;
    }

    throw new Error(res.data?.message || 'اسم المستخدم أو كلمة المرور غير صحيحة');
  };

  /**
   * تسجيل الخروج الذري (Atomic Logout)
   * يمسح الجلسة المشفرة ومحرك المزامنة والحالة التفاعلية
   */
  const logout = async () => {
    token.value = null;
    user.value = null;
    terminal.value = null;
    await sessionService.clearSession();
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
