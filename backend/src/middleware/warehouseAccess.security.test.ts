import { describe, expect, it, vi } from 'vitest';
import { requireGlobalWarehouseRole } from './warehouseAccess.ts';
import authRouter from '../routes/auth.routes.ts';

const invoke = (role: string | undefined) => {
  const next = vi.fn();
  const request = { user: role ? { role_name: role } : undefined };
  requireGlobalWarehouseRole(request as any, {} as any, next);
  return next;
};

describe('requireGlobalWarehouseRole', () => {
  it.each(['admin', 'sys_admin', 'owner', 'manager'])(
    'allows shop-wide financial access for %s',
    (role) => {
      const next = invoke(role);
      expect(next).toHaveBeenCalledOnce();
      expect(next).toHaveBeenCalledWith();
    },
  );

  it.each(['cashier', 'warehouse', undefined])(
    'denies shop-wide financial access for %s',
    (role) => {
      const next = invoke(role);
      expect(next).toHaveBeenCalledOnce();
      const error = next.mock.calls[0][0];
      expect(error).toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    },
  );

  it.each(['/dashboard', '/operations/alerts'])(
    'installs the global-role guard before the handler for %s',
    (path) => {
      const route = (authRouter as any).stack.find(
        (layer: any) => layer.route?.path === path,
      )?.route;
      expect(route).toBeDefined();
      const handlers = route.stack.map((layer: any) => layer.handle);
      expect(handlers.indexOf(requireGlobalWarehouseRole)).toBeGreaterThan(0);
      expect(handlers.indexOf(requireGlobalWarehouseRole)).toBeLessThan(handlers.length - 1);
    },
  );
});
