import { defineStore } from 'pinia';
import { ref, computed, onScopeDispose } from 'vue';
import { auth as authApi } from '@/api';
import { invalidateSessionContext, setSessionAccessToken } from '@/api/client';
import { clearManagerOverride } from '@/services/managerOverride';
import { useAppStore } from '@/stores/app';
import { ADMIN_ROLES, satisfiesPermission } from '../../../shared/permissions.js';
import type { User, Permission } from '../../../shared/types.ts';

export type { User, Permission };

const getErrorStatus = (error: unknown): number | undefined => {
  if (typeof error !== 'object' || error === null) return undefined;
  const candidate = error as { response?: { status?: unknown }; status?: unknown };
  const status = candidate.response?.status ?? candidate.status;
  return typeof status === 'number' ? status : undefined;
};

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null);
  const permissions = ref<Permission[]>([]);
  const profileLoaded = ref(false);

  let activeProfilePromise: Promise<void> | null = null;
  // Set-Cookie cannot be canceled by a renderer revision guard. Serialize auth
  // requests so a delayed logout/login cannot overwrite a newer session cookie.
  let authTransition: Promise<unknown> = Promise.resolve();
  let authContextRevision = 0;
  const serializeAuth = <T>(operation: () => Promise<T>): Promise<T> => {
    const contextRevision = authContextRevision;
    const run = () => {
      if (contextRevision !== authContextRevision) throw new Error('SESSION_CONTEXT_CHANGED');
      return operation();
    };
    const next = authTransition.then(run, run);
    authTransition = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  };

  // Web sessions prefer the HttpOnly access_token cookie. The short-lived
  // in-memory value is only a fallback for cross-origin browser sessions and
  // is never persisted in localStorage.
  const token = ref<string | null>(null);
  let authRevision = 0;
  const clearLocalSession = (clearSharedStorage = true) => {
    authRevision++;
    invalidateSessionContext();
    activeProfilePromise = null;
    token.value = null;
    setSessionAccessToken(null);
    user.value = null;
    permissions.value = [];
    profileLoaded.value = false;
    useAppStore().resetNotifications();
    if (clearSharedStorage) {
      localStorage.removeItem('user');
      localStorage.removeItem('token');
    }
  };
  const onServerChanged = () => {
    authContextRevision++;
    const wasAuthenticated = !!user.value || !!token.value;
    clearLocalSession();
    if (wasAuthenticated) window.location.replace('/login');
  };
  const onSharedSessionChanged = (event: StorageEvent) => {
    if (
      event.storageArea !== localStorage ||
      ![null, 'user', 'binalagoouz_server_url'].includes(event.key) ||
      (event.key !== null && event.oldValue === event.newValue)
    )
      return;
    authContextRevision++;
    // Cookies/storage are shared between tabs; bearer tokens and cached views
    // are not. Reload from the new context without erasing another tab's login.
    clearLocalSession(false);
    window.location.reload();
  };
  window.addEventListener('erp:server-changed', onServerChanged);
  window.addEventListener('storage', onSharedSessionChanged);
  onScopeDispose(() => {
    window.removeEventListener('erp:server-changed', onServerChanged);
    window.removeEventListener('storage', onSharedSessionChanged);
  });

  const fetchProfile = async () => {
    if (activeProfilePromise) return activeProfilePromise;
    const revision = authRevision;

    activeProfilePromise = (async (): Promise<void> => {
      try {
        const res = await authApi.profile();
        if (revision === authRevision && res.data) {
          user.value = res.data.user;
          permissions.value = res.data.permissions || [];
          localStorage.setItem('user', JSON.stringify(res.data.user));
          profileLoaded.value = true;
        }
      } catch (error: unknown) {
        if (revision === authRevision && getErrorStatus(error) === 401) clearLocalSession();
      } finally {
        if (revision === authRevision) activeProfilePromise = null;
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
    if (profileLoaded.value && user.value?.role_name && ADMIN_ROLES.includes(user.value.role_name))
      return true;
    return satisfiesPermission(
      permissions.value.map((permission) => permission.code),
      code,
    );
  };

  const login = (username: string, password: string) =>
    serializeAuth(async () => {
      clearLocalSession();
      const revision = authRevision;
      const res = await authApi.login({ username, password });
      if (revision !== authRevision) throw new Error('SESSION_CONTEXT_CHANGED');
      clearManagerOverride();
      authRevision++;
      activeProfilePromise = null;
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
    });

  const logout = () =>
    serializeAuth(async () => {
      const revision = authRevision;
      try {
        await authApi.logout();
      } catch (error: unknown) {
        // HttpOnly cookies cannot be cleared here. A network/server failure must
        // stay visible; an already expired/revoked session is safe to clear.
        if (getErrorStatus(error) !== 401) throw error;
      }
      if (revision === authRevision) clearLocalSession();
    });

  const loadFromStorage = () => {
    if (permissions.value.length === 0) {
      fetchProfile();
    }
  };

  const isCashier = computed(() => {
    if (!profileLoaded.value) return false;
    return user.value?.role_name === 'cashier';
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
    // A successful full restore already revoked authorization in its transaction.
    invalidateSession: () => clearLocalSession(),
    loadFromStorage,
    fetchProfile,
  };
});
