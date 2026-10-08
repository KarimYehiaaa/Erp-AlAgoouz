import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia, disposePinia, getActivePinia } from 'pinia';

const { authApiMock } = vi.hoisted(() => ({
  authApiMock: {
    login: vi.fn(),
    profile: vi.fn(),
    logout: vi.fn(),
  },
}));

vi.mock('@/api', () => ({ auth: authApiMock }));

import { useAuthStore } from '@/stores/auth';
import { useAppStore } from '@/stores/app';

const adminUser = { id: 1, username: 'boss', role_name: 'admin' };
const cashierUser = { id: 2, username: 'cash', role_name: 'cashier' };

describe('auth store', () => {
  const replaceLocation = vi.fn();
  const reloadLocation = vi.fn();
  beforeEach(() => {
    replaceLocation.mockReset();
    reloadLocation.mockReset();
    const browserWindow = window;
    const location = {
      origin: browserWindow.location.origin,
      protocol: browserWindow.location.protocol,
      pathname: browserWindow.location.pathname,
      replace: replaceLocation,
      reload: reloadLocation,
    };
    vi.stubGlobal(
      'window',
      new Proxy(browserWindow, {
        get(target, property) {
          return property === 'location' ? location : Reflect.get(target, property, target);
        },
      }),
    );
    setActivePinia(createPinia());
    localStorage.clear();
    authApiMock.login.mockReset();
    authApiMock.profile.mockReset();
    authApiMock.logout.mockReset();
  });
  afterEach(() => {
    disposePinia(getActivePinia()!);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('removes the previous account notification cache before a new login, including failed login', async () => {
    const app = useAppStore();
    const auth = useAuthStore();
    app.notifications = [{ title: 'Previous account confidential report' }];
    app.notificationDrawerOpen = true;
    authApiMock.login.mockRejectedValue(new Error('fixture rejected login'));
    await expect(auth.login('cash', 'fixture')).rejects.toThrow('fixture rejected login');
    expect(app.notifications).toEqual([]);
    expect(app.notificationDrawerOpen).toBe(false);
  });

  it('removes notifications after confirmed logout but retains them after failed logout', async () => {
    authApiMock.login.mockResolvedValue({ data: { user: adminUser, permissions: [] } });
    const auth = useAuthStore();
    await auth.login('boss', 'fixture');
    const app = useAppStore();
    app.notifications = [{ title: 'Private report' }];
    authApiMock.logout.mockRejectedValue(new Error('fixture unavailable'));
    await expect(auth.logout()).rejects.toThrow('fixture unavailable');
    expect(app.notifications).toHaveLength(1);
    authApiMock.logout.mockResolvedValue({ data: {} });
    await auth.logout();
    expect(app.notifications).toEqual([]);
  });

  it('stores the user and permissions while keeping the web JWT out of storage', async () => {
    authApiMock.login.mockResolvedValue({
      data: { user: cashierUser, token: 'mock-jwt-token-123', permissions: [{ code: 'pos.view' }] },
    });
    const auth = useAuthStore();
    await auth.login('cash', 'secret');

    expect(auth.user?.username).toBe('cash');
    expect(auth.isAuthenticated).toBe(true);
    expect(localStorage.getItem('token')).toBeNull();
    // The web fallback is memory-only; it must never reach persistent storage.
    expect(auth.token).toBe('mock-jwt-token-123');
  });

  it('grants admins every permission via bypass', async () => {
    authApiMock.login.mockResolvedValue({
      data: { user: adminUser, permissions: [] },
    });
    const auth = useAuthStore();
    await auth.login('boss', 'secret');
    expect(auth.hasPermission('anything.at.all')).toBe(true);
  });

  it('does not grant admin permissions from a cached profile before server verification', () => {
    vi.useFakeTimers();
    localStorage.setItem('user', JSON.stringify(adminUser));
    const auth = useAuthStore();

    expect(auth.isAuthenticated).toBe(true);
    expect(auth.profileLoaded).toBe(false);
    expect(auth.hasPermission('anything.at.all')).toBe(false);
  });

  it('does not identify a cached cashier role before server verification', () => {
    vi.useFakeTimers();
    localStorage.setItem('user', JSON.stringify(cashierUser));
    const auth = useAuthStore();

    expect(auth.isCashier).toBe(false);
  });

  it('checks granular permissions for non-admins', async () => {
    authApiMock.login.mockResolvedValue({
      data: { user: cashierUser, permissions: [{ code: 'pos.view' }] },
    });
    const auth = useAuthStore();
    await auth.login('cash', 'secret');
    expect(auth.hasPermission('pos.view')).toBe(true);
    expect(auth.hasPermission('users.delete')).toBe(false);
  });

  it('clears the session on logout and purges legacy tokens', async () => {
    localStorage.setItem('token', 'legacy-jwt');
    authApiMock.login.mockResolvedValue({
      data: { user: cashierUser, permissions: [] },
    });
    authApiMock.logout.mockResolvedValue({ data: {} });

    const auth = useAuthStore();
    await auth.login('cash', 'secret');
    await auth.logout();

    expect(auth.user).toBeNull();
    expect(auth.isAuthenticated).toBe(false);
    expect(localStorage.getItem('user')).toBeNull();
    expect(localStorage.getItem('token')).toBeNull();
  });

  it('reports logout failure while retaining the still-live session, and allows retry', async () => {
    authApiMock.login.mockResolvedValue({
      data: { user: cashierUser, permissions: [] },
    });
    authApiMock.logout.mockRejectedValue(new Error('network down'));

    const auth = useAuthStore();
    await auth.login('cash', 'secret');
    await expect(auth.logout()).rejects.toThrow('network down');
    expect(auth.user?.id).toBe(cashierUser.id);
    expect(auth.isAuthenticated).toBe(true);
    expect(JSON.parse(localStorage.getItem('user')!).id).toBe(cashierUser.id);
    authApiMock.logout.mockResolvedValue({ data: {} });
    await auth.logout();
    expect(auth.isAuthenticated).toBe(false);
  });

  it('clears an already revoked session without calling logout again after a 401 profile', async () => {
    authApiMock.login.mockResolvedValue({
      data: { user: cashierUser, token: 'old', permissions: [] },
    });
    const auth = useAuthStore();
    await auth.login('cash', 'secret');
    authApiMock.profile.mockRejectedValue({ status: 401 });
    await auth.fetchProfile();
    expect(auth.isAuthenticated).toBe(false);
    expect(authApiMock.logout).not.toHaveBeenCalled();
  });

  it('treats an already expired logout as complete', async () => {
    authApiMock.login.mockResolvedValue({ data: { user: cashierUser, permissions: [] } });
    const auth = useAuthStore();
    await auth.login('cash', 'secret');
    authApiMock.logout.mockRejectedValue({ response: { status: 401 } });
    await auth.logout();
    expect(auth.isAuthenticated).toBe(false);
  });

  it('waits for a delayed logout cookie before starting a new login', async () => {
    let cookie: number | null = cashierUser.id;
    let finishLogout!: () => void;
    authApiMock.login.mockResolvedValueOnce({ data: { user: cashierUser, permissions: [] } });
    const auth = useAuthStore();
    await auth.login('cash', 'secret');
    authApiMock.logout.mockImplementation(() =>
      new Promise<void>((resolve) => {
        finishLogout = resolve;
      }).then(() => {
        cookie = null;
        return { data: {} };
      }),
    );
    authApiMock.login.mockImplementation(async () => {
      cookie = adminUser.id;
      return { data: { user: adminUser, permissions: [] } };
    });
    const leaving = auth.logout();
    await vi.waitFor(() => expect(authApiMock.logout).toHaveBeenCalledOnce());
    const entering = auth.login('boss', 'secret');
    await Promise.resolve();
    expect(authApiMock.login).toHaveBeenCalledTimes(1);
    finishLogout();
    await Promise.all([leaving, entering]);
    expect(cookie).toBe(adminUser.id);
    expect(auth.user?.id).toBe(adminUser.id);
  });

  it('waits for a delayed login cookie before completing a following logout', async () => {
    let cookie: number | null = null;
    let finishLogin!: () => void;
    authApiMock.login.mockImplementation(() =>
      new Promise<void>((resolve) => {
        finishLogin = resolve;
      }).then(() => {
        cookie = cashierUser.id;
        return { data: { user: cashierUser, permissions: [] } };
      }),
    );
    authApiMock.logout.mockImplementation(async () => {
      cookie = null;
      return { data: {} };
    });
    const auth = useAuthStore();
    const entering = auth.login('cash', 'secret');
    await vi.waitFor(() => expect(authApiMock.login).toHaveBeenCalledOnce());
    const leaving = auth.logout();
    await Promise.resolve();
    expect(authApiMock.logout).not.toHaveBeenCalled();
    finishLogin();
    await Promise.all([entering, leaving]);
    expect(cookie).toBeNull();
    expect(auth.isAuthenticated).toBe(false);
  });

  it('does not send a queued old login to a newly selected server', async () => {
    let finishLogin!: () => void;
    authApiMock.login.mockImplementation(() =>
      new Promise<void>((resolve) => {
        finishLogin = resolve;
      }).then(() => ({ data: { user: cashierUser, permissions: [] } })),
    );
    const auth = useAuthStore();
    const entering = auth.login('cash', 'secret');
    const firstRejected = expect(entering).rejects.toThrow('SESSION_CONTEXT_CHANGED');
    await vi.waitFor(() => expect(authApiMock.login).toHaveBeenCalledOnce());
    const queued = auth.login('boss', 'secret');
    const queuedRejected = expect(queued).rejects.toThrow('SESSION_CONTEXT_CHANGED');
    window.dispatchEvent(new Event('erp:server-changed'));
    finishLogin();
    await Promise.all([firstRejected, queuedRejected]);
    expect(authApiMock.login).toHaveBeenCalledOnce();
    expect(auth.isAuthenticated).toBe(false);
  });

  it.each(['user', 'binalagoouz_server_url'])(
    'invalidates this tab after a shared %s change without deleting the other tab session',
    async (key) => {
      authApiMock.login.mockResolvedValue({
        data: { user: cashierUser, token: 'cash-token', permissions: [{ code: 'pos.view' }] },
      });
      const auth = useAuthStore();
      await auth.login('cash', 'secret');
      const sharedUser = JSON.stringify(adminUser);
      localStorage.setItem('user', sharedUser);
      window.dispatchEvent(
        new StorageEvent('storage', {
          storageArea: localStorage,
          key,
          oldValue: 'old',
          newValue: 'new',
        }),
      );
      expect(auth.isAuthenticated).toBe(false);
      expect(auth.token).toBeNull();
      expect(auth.permissions).toEqual([]);
      expect(localStorage.getItem('user')).toBe(sharedUser);
      expect(reloadLocation).toHaveBeenCalledOnce();
    },
  );
});
