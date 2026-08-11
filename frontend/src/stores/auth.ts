import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { auth as authApi } from '@/api';

export interface User {
  id: number;
  username: string;
  full_name?: string;
  role_id?: number;
  role_name?: string;
  [key: string]: any;
}

export interface Permission {
  code: string;
  name_ar?: string;
  module?: string;
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null);
  const token = ref<string | null>(localStorage.getItem('token'));
  const permissions = ref<Permission[]>([]);
  const profileLoaded = ref(false);

  let activeProfilePromise: Promise<any> | null = null;

  const fetchProfile = async () => {
    if (!token.value) return;
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
        if (e.response?.status === 401) logout();
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
    } catch (_) {
      /* ignore corrupt data */
    }
  }

  const isAuthenticated = computed(() => !!token.value);
  
  const legacyMap: Record<string, string[]> = {
    'sales.branch': ['pos.view'],
    'sales.wholesale': ['pos.view'],
    'sales.pos': ['pos.view'],
    'sales.return': ['pos.view'],
    'products.manage': ['products.view', 'products.add', 'products.edit', 'products.delete'],
    'inventory.manage': ['inventory.view', 'inventory.add', 'inventory.edit', 'inventory.delete'],
    'customers.manage': ['customers.view', 'customers.add', 'customers.edit', 'customers.delete'],
    'suppliers.manage': ['suppliers.view', 'suppliers.add', 'suppliers.edit', 'suppliers.delete'],
    'invoices.manage': ['invoices.view', 'invoices.add', 'invoices.edit', 'invoices.delete'],
    'expenses.manage': ['expenses.view', 'expenses.add', 'expenses.edit', 'expenses.delete'],
    'reports.view': ['reports.view', 'reports.add', 'reports.edit', 'reports.delete'],
    'users.manage': ['users.view', 'users.add', 'users.edit', 'users.delete'],
    'settings.manage': ['settings.view', 'settings.add', 'settings.edit', 'settings.delete'],
    'hr.manage': ['shifts.view', 'shifts.add', 'shifts.edit', 'shifts.delete']
  };

  const hasPermission = (code: string) => {
    if (user.value?.role_name === 'owner' || user.value?.role_name === 'admin' || user.value?.role_name === 'sys_admin') return true;
    if (permissions.value.some((p) => p.code === code)) return true;
    
    if (legacyMap[code]) {
      return legacyMap[code].some(mappedCode => permissions.value.some(p => p.code === mappedCode));
    }
    return false;
  };

  const login = async (username: string, password: string) => {
    const res = await authApi.login({ username, password });
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
      if (token.value) await authApi.logout();
    } catch (e) {
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
    if (token.value && permissions.value.length === 0) {
      fetchProfile();
    }
  };

  return {
    user,
    token,
    permissions,
    profileLoaded,
    isAuthenticated,
    hasPermission,
    login,
    logout,
    loadFromStorage,
    fetchProfile,
  };
});
