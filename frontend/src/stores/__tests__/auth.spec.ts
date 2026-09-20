import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

const { authApiMock } = vi.hoisted(() => ({
  authApiMock: {
    login: vi.fn(),
    profile: vi.fn(),
    logout: vi.fn(),
  },
}));

vi.mock('@/api', () => ({ auth: authApiMock }));

import { useAuthStore } from '@/stores/auth';

const adminUser = { id: 1, username: 'boss', role_name: 'admin' };
const cashierUser = { id: 2, username: 'cash', role_name: 'cashier' };

describe('auth store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    authApiMock.login.mockReset();
    authApiMock.profile.mockReset();
    authApiMock.logout.mockReset();
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

  it('logs out locally when the logout API fails', async () => {
    authApiMock.login.mockResolvedValue({
      data: { user: cashierUser, permissions: [] },
    });
    authApiMock.logout.mockRejectedValue(new Error('network down'));

    const auth = useAuthStore();
    await auth.login('cash', 'secret');
    await auth.logout();
    expect(auth.user).toBeNull();
  });
});
