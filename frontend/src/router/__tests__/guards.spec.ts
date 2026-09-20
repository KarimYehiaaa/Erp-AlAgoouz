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

import { navigationGuard } from '@/router/guards';
import { useAuthStore } from '@/stores/auth';

/** يبني كائن مسار مصغّر بما يكفي للحارس */
const route = (overrides: Record<string, any> = {}) => ({
  path: '/somewhere',
  name: 'Test',
  meta: {},
  ...overrides,
});

const runGuard = async (to: Record<string, any>) => {
  const next = vi.fn();
  await navigationGuard(route(to), route(), next as any);
  return { next };
};

describe('navigation guard', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    authApiMock.login.mockReset();
    authApiMock.profile.mockReset();
    authApiMock.logout.mockReset();
  });

  it('redirects unauthenticated users away from protected routes', async () => {
    const { next } = await runGuard({ meta: { requiresAuth: true } });
    expect(next).toHaveBeenCalledWith({ path: '/login', query: { redirect: '/somewhere' } });
  });

  it('allows unauthenticated access to guest pages', async () => {
    const { next } = await runGuard({ path: '/login', meta: { guest: true } });
    expect(next).toHaveBeenCalledExactlyOnceWith();
  });

  it('locks cashiers to /branch-sales', async () => {
    authApiMock.profile.mockResolvedValue({
      data: { user: { id: 2, role_name: 'cashier' }, permissions: [{ code: 'pos.view' }] },
    });
    const auth = useAuthStore();
    await auth.fetchProfile();

    const { next } = await runGuard({ path: '/settings', meta: { requiresAuth: true } });
    expect(next).toHaveBeenCalledWith('/branch-sales');
  });

  it('lets cashiers stay on /branch-sales', async () => {
    authApiMock.profile.mockResolvedValue({
      data: { user: { id: 2, role_name: 'cashier' }, permissions: [] },
    });
    const auth = useAuthStore();
    await auth.fetchProfile();

    const { next } = await runGuard({ path: '/branch-sales', meta: { requiresAuth: true } });
    expect(next).toHaveBeenCalledExactlyOnceWith();
  });

  it('blocks routes whose permission the user lacks', async () => {
    authApiMock.profile.mockResolvedValue({
      data: { user: { id: 3, role_name: 'supervisor' }, permissions: [{ code: 'reports.view' }] },
    });
    const auth = useAuthStore();
    await auth.fetchProfile();

    const denied = await runGuard({
      meta: { requiresAuth: true, permission: ['users.manage'] },
    });
    expect(denied.next).toHaveBeenCalledWith('/');

    const allowed = await runGuard({
      meta: { requiresAuth: true, permission: ['reports.view', 'expenses.view'] },
    });
    expect(allowed.next).toHaveBeenCalledExactlyOnceWith();
  });

  it('blocks non-admins on requireAdmin pages', async () => {
    authApiMock.profile.mockResolvedValue({
      data: { user: { id: 4, role_name: 'manager' }, permissions: [] },
    });
    const auth = useAuthStore();
    await auth.fetchProfile();

    const { next } = await runGuard({ meta: { requiresAuth: true, requireAdmin: true } });
    expect(next).toHaveBeenCalledWith('/');
  });

  it('passes admins everywhere', async () => {
    authApiMock.profile.mockResolvedValue({
      data: { user: { id: 1, role_name: 'admin' }, permissions: [] },
    });
    const auth = useAuthStore();
    await auth.fetchProfile();

    const { next } = await runGuard({
      meta: { requiresAuth: true, requireAdmin: true, permission: ['anything.at.all'] },
    });
    expect(next).toHaveBeenCalledExactlyOnceWith();
  });

  it('redirects authenticated users away from guest pages', async () => {
    authApiMock.profile.mockResolvedValue({
      data: { user: { id: 1, role_name: 'admin' }, permissions: [] },
    });
    const auth = useAuthStore();
    await auth.fetchProfile();

    const { next } = await runGuard({ path: '/login', meta: { guest: true } });
    expect(next).toHaveBeenCalledWith('/');
  });
});
