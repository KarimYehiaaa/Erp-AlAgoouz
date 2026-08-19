import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { auth as authApi } from '@/api';
import { ADMIN_ROLES, satisfiesPermission } from '../../../shared/permissions.js';
import type { User, Permission } from '../../../shared/types.ts';

export type { User, Permission };

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null);
  // قراءة التوكن من localStorage كـ fallback للتوافقية (الـ Backend يضبط HttpOnly cookie أيضاً)
  const token = ref<string | null>(localStorage.getItem('token'));
  const permissions = ref<Permission[]>([]);
  const profileLoaded = ref(false);

  let activeProfilePromise: Promise<any> | null = null;

  const fetchProfile = async () => {
    if (!token.value && !document.cookie.includes('access_token')) return;
    if (activeProfilePromise) return activeProfilePromise;

    activeProfilePromise = (async () => {
      try {
        const res = await authApi.profile();
        if (res.data) {
          user.value = res.data.user;
          permissions.value = res.data.permissions || [];
          localStorage.setItem('user', JSON.stringify(res.data.user));
          profileLoaded.value = true;
        }
      } catch (e: any) {
        if (e.response?.status === 401 || e.status === 401) logout();
      } finally {
        activeProfilePromise = null;
      }
    })();

    return activeProfilePromise;
  };

  const _stored = localStorage.getItem('user');
  if (_stored && token.value) {
    try {
      user.value = JSON.parse(_stored);
      // Fetch fresh permissions asynchronously
      setTimeout(fetchProfile, 0);
    } catch {
      /* ignore corrupt data */
    }
  }

  const isAuthenticated = computed(() => !!token.value || !!user.value);

  const hasPermission = (code: string) => {
    if (user.value?.role_name && ADMIN_ROLES.includes(user.value.role_name)) return true;
    return satisfiesPermission(
      permissions.value.map((p: any) => p.code),
      code,
    );
  };

  const login = async (username: string, password: string) => {
    const res = await authApi.login({ username, password });
    // التوكن يتخزن الآن في HttpOnly cookie من Backend
    // نحتفظ بنسخة في localStorage كـ fallback فقط خلال فترة الانتقال
    token.value = res.data.token;
    user.value = res.data.user;
    permissions.value = res.data.permissions || [];
    profileLoaded.value = true;
    localStorage.setItem('token', res.data.token);
    localStorage.setItem('user', JSON.stringify(res.data.user));
    return res;
  };

  const logout = async () => {
    try {
      if (token.value || user.value) await authApi.logout();
    } catch (e: any) {
      console.error('Logout API failed:', e);
    }
    token.value = null;
    user.value = null;
    permissions.value = [];
    profileLoaded.value = false;
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  };

  const loadFromStorage = () => {
    if (
      (token.value || document.cookie.includes('access_token')) &&
      permissions.value.length === 0
    ) {
      fetchProfile();
    }
  };

  const isCashier = computed(() => {
    const role = user.value?.role_name || (user.value as any)?.role;
    return role === 'cashier';
  });

  return {
    user,
    token,
    permissions,
    profileLoaded,
    isAuthenticated,
    isCashier,
    hasPermission,
    login,
    logout,
    loadFromStorage,
    fetchProfile,
  };
});
