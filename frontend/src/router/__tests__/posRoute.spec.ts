import { describe, expect, it } from 'vitest';
import router from '@/router';

describe('single-shop POS route', () => {
  it('uses one canonical protected POS screen', () => {
    const route = router.resolve('/pos');
    expect(route.name).toBe('POS');
    expect(route.meta.requiresAuth).toBe(true);
    expect(route.meta.permission).toBe('pos.view');
    expect(route.matched.at(-1)?.components?.default).toBeTypeOf('function');
  });

  it('does not expose a retired branch-specific POS route', () => {
    expect(router.getRoutes().some((record) => record.path === '/branch-sales')).toBe(false);
  });
});
