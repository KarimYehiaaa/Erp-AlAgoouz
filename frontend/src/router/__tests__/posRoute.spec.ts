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

  it('keeps old bookmarks as a redirect, not a second screen', () => {
    const record = router.resolve('/branch-sales').matched.at(-1);
    expect(record?.redirect).toBe('/pos');
    expect(record?.components).toBeFalsy();
  });
});
