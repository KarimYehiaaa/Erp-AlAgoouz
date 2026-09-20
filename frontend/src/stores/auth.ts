import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { auth as authApi } from '@/api';
import { setSessionAccessToken } from '@/api/client';
import { ADMIN_ROLES, satisfiesPermission } from '../../../shared/permissions.js';
import type { User, Permission } from '../../../shared/types.ts';

export type { User, Permission };

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null);
  const permissions = ref<Permission[]>([]);
  const profileLoaded = ref(false);

  let activeProfilePromise: Promise<any> | null = null;

  // Web sessions prefer the HttpOnly access_token cookie. The short-lived
  // in-memory value is only a fallback for cross-origin browser sessions and
  // is never persisted in localStorage.
  const token = ref<string | null>(null);

  const fetchProfile = async () => {
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
  if (_stored) {
    try {
      user.value = JSON.parse(_stored);
      // Fetch fresh permissions asynchronously
      setTimeout(fetchProfile, 0);
    } catch {
      /* ignore corrupt data */
    }
  }

  const isAuthenticated = computed(() => !!user.value || !!token.value);

  const hasPermission = (code: string) => {
    if (user.value?.role_name && ADMIN_ROLES.includes(user.value.role_name)) return true;
    return satisfiesPermission(
      permissions.value.map((p: any) => p.code),
      code,
    );
  };

  const login = async (username: string, password: string) => {
    const res = await authApi.login({ username, password });
    user.value = res.data.user;
    permissions.value = res.data.permissions || [];
    profileLoaded.value = true;
    // The API still returns a token for Desktop POS compatibility. Keep it in
    // memory only so local frontend -> cloud API sessions survive blocked
    // cross-site cookies without creating a persistent XSS target.
    token.value = res.data.token || null;
    setSessionAccessToken(token.value);
    localStorage.setItem('user', JSON.stringify(res.data.user));
    return res;
  };

  const logout = async () => {
    try {
      if (user.value || token.value) await authApi.logout();
    } catch (e: any) {
      console.error('Logout API failed:', e);
    }
    token.value = null;
    setSessionAccessToken(null);
    user.value = null;
    permissions.value = [];
    profileLoaded.value = false;
    localStorage.removeItem('user');
    // Remove any legacy browser token left by older versions.
    localStorage.removeItem('token');
  };

  const loadFromStorage = () => {
    if (permissions.value.length === 0) {
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
