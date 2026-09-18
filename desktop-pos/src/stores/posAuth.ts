import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api } from '../services/api';

export const usePosAuthStore = defineStore('posAuth', () => {
  const user = ref<any>(JSON.parse(localStorage.getItem('pos_user') || 'null'));
  const token = ref<string | null>(localStorage.getItem('pos_token'));
  const terminal = ref<any>(JSON.parse(localStorage.getItem('pos_terminal') || 'null'));

  const isAuthenticated = computed(() => !!token.value && !!user.value);
  const isCashier = computed(() => user.value?.role_name === 'cashier' || user.value?.role_name === 'admin');

  // Sync token to Electron syncWorker on initial load
  if (token.value && window.electronAPI?.setAuthToken) {
    window.electronAPI.setAuthToken(token.value, localStorage.getItem('pos_server_url') || undefined);
  }

  const login = async (credentials: { username: string; password: string }) => {
    const res = await api.post('/auth/login', credentials);
    const payload = res.data?.data || res.data;
    if (res.data?.success && payload?.token) {
      token.value = payload.token;
      user.value = payload.user;
      localStorage.setItem('pos_token', payload.token);
      localStorage.setItem('pos_user', JSON.stringify(payload.user));

      if (window.electronAPI?.setAuthToken) {
        const sessionRes = await window.electronAPI.setAuthToken(payload.token, localStorage.getItem('pos_server_url') || undefined);
        if (sessionRes && !sessionRes.success) {
          console.warn('[PosAuth] Background sync session warning:', sessionRes.error);
        }
      }
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
    isAuthenticated,
    isCashier,
    login,
    logout,
  };
});
