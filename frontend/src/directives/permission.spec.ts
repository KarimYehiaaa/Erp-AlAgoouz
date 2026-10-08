import { createApp, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { afterEach, describe, expect, it } from 'vitest';
import { permissionDirective } from './permission';
import { useAuthStore } from '@/stores/auth';

describe('v-permission', () => {
  let app: ReturnType<typeof createApp> | undefined;
  let root: HTMLDivElement | undefined;

  afterEach(() => {
    app?.unmount();
    root?.remove();
    app = undefined;
    root = undefined;
  });

  it('reacts to profile permissions and restores the same mounted element', async () => {
    const pinia = createPinia();
    const auth = useAuthStore(pinia);
    auth.user = { id: 1, username: 'cashier', role_name: 'cashier' } as never;
    auth.permissions = [];

    root = document.createElement('div');
    document.body.append(root);
    app = createApp({ template: `<button v-permission="'sales.edit'">تعديل</button>` });
    app.use(pinia);
    app.directive('permission', permissionDirective);
    app.mount(root);

    const button = root.querySelector('button');
    expect(button).not.toBeNull();
    expect(button?.hidden).toBe(true);

    auth.permissions = [{ code: 'sales.edit' } as never];
    await nextTick();
    expect(root.querySelector('button')).toBe(button);
    expect(button?.hidden).toBe(false);

    auth.permissions = [];
    await nextTick();
    expect(button?.hidden).toBe(true);
  });

  it('preserves an element hidden by its own markup', async () => {
    const pinia = createPinia();
    const auth = useAuthStore(pinia);
    auth.user = { id: 1, username: 'admin', role_name: 'admin' } as never;

    root = document.createElement('div');
    document.body.append(root);
    app = createApp({ template: `<button hidden v-permission="'sales.edit'">تعديل</button>` });
    app.use(pinia);
    app.directive('permission', permissionDirective);
    app.mount(root);

    const button = root.querySelector('button');
    expect(button?.hidden).toBe(true);
    await nextTick();
    expect(button?.hidden).toBe(true);
  });
});
