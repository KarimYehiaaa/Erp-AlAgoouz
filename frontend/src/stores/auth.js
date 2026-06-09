import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { auth as authApi } from '@/api';

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null);
  const token = ref(localStorage.getItem('token'));
  const permissions = ref([]);

  // إصلاح: تحميل المستخدم من localStorage مرة واحدة عند إنشاء الـ store
  // بدلاً من تكراره في كل route navigation
  const _stored = localStorage.getItem('user');
  if (_stored && token.value) {
    try { user.value = JSON.parse(_stored); } catch (_) { /* ignore corrupt data */ }
  }

  const isAuthenticated = computed(() => !!token.value);
  const hasPermission = (code) =>
    user.value?.role_name === 'admin' || permissions.value.some((p) => p.code === code);

  const login = async (username, password) => {
    const res = await authApi.login({ username, password });
    token.value = res.data.token;
    user.value = res.data.user;
    permissions.value = res.data.permissions || [];
    localStorage.setItem('token', res.data.token);
    localStorage.setItem('user', JSON.stringify(res.data.user));
    return res;
  };

  const logout = () => {
    token.value = null;
    user.value = null;
    permissions.value = [];
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  };

  // loadFromStorage يفضل موجود للتوافق مع الكود القديم لكن بيتحقق أولاً
  const loadFromStorage = () => {
    if (user.value) return; // مش محتاج نحمل تاني لو موجود
    const stored = localStorage.getItem('user');
    if (stored && token.value) {
      try { user.value = JSON.parse(stored); } catch (_) { /* ignore */ }
    }
  };

  return { user, token, permissions, isAuthenticated, hasPermission, login, logout, loadFromStorage };
});
