import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { auth as authApi } from '@/api';

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null);
  const token = ref(localStorage.getItem('token'));
  const permissions = ref([]);
  const profileLoaded = ref(false);

  let activeProfilePromise = null;

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
      } catch (e) {
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
    } catch (_) { /* ignore corrupt data */ }
  }

  const isAuthenticated = computed(() => !!token.value);
  const hasPermission = (code) =>
    user.value?.role_name === 'admin' || permissions.value.some((p) => p.code === code);

  const login = async (username, password) => {
    const res = await authApi.login({ username, password });
    token.value = res.data.token;
    user.value = res.data.user;
    permissions.value = res.data.permissions || [];
    profileLoaded.value = true;
    localStorage.setItem('token', res.data.token);
    if (res.data.refreshToken) {
      localStorage.setItem('refreshToken', res.data.refreshToken);
    }
    localStorage.setItem('user', JSON.stringify(res.data.user));
    return res;
  };

  const logout = () => {
    token.value = null;
    user.value = null;
    permissions.value = [];
    profileLoaded.value = false;
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
  };

  const loadFromStorage = () => {
    // Already handled at store initialization, but keeping for compatibility.
    // fetchProfile will ensure we get permissions if they were empty.
    if (token.value && permissions.value.length === 0) {
      fetchProfile();
    }
  };

  return { user, token, permissions, profileLoaded, isAuthenticated, hasPermission, login, logout, loadFromStorage, fetchProfile };
});
