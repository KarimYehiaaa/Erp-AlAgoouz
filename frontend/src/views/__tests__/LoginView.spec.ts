import { afterEach, describe, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import axios from 'axios';
import LoginView from '../LoginView.vue';

// Mock vue-router
vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
  useRoute: () => ({
    query: {},
  }),
}));

// Mock pinia stores
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    login: vi.fn().mockResolvedValue(true),
  }),
}));

describe('LoginView.vue', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('does not let an earlier health response finish a newer server test', async () => {
    vi.stubEnv('VITE_TRUSTED_SERVER_URLS', 'https://first.example');
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    let finishFirst!: (value: unknown) => void;
    let finishSecond!: (value: unknown) => void;
    vi.spyOn(axios, 'get')
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishFirst = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishSecond = resolve;
          }),
      );
    localStorage.clear();
    const wrapper = mount(LoginView, { global: { stubs: { AppIcon: true } } });
    try {
      await wrapper.find('.server-status-btn').trigger('click');
      await wrapper.find('.server-input').setValue('https://first.example');
      await wrapper.find('.btn-test').trigger('click');
      await wrapper.findAll('.preset-chip')[0]!.trigger('click');
      finishFirst({ status: 200, data: { success: true, db: { connected: true } } });
      await flushPromises();
      expect(wrapper.find('.test-box').exists()).toBe(false);
      expect(wrapper.find('.btn-test').attributes('disabled')).toBeDefined();
      finishSecond({ status: 200, data: { success: true, db: { connected: true } } });
      await flushPromises();
      expect(wrapper.find('.test-box').text()).toContain('الاتصال ناجح');
      expect(wrapper.find('.btn-test').attributes('disabled')).toBeUndefined();
    } finally {
      wrapper.unmount();
    }
  });

  it('explains unsupported Android Release HTTP without sending a health request', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const get = vi.spyOn(axios, 'get').mockResolvedValue({ data: {} });
    const previous = Object.getOwnPropertyDescriptor(window, 'Capacitor');
    Object.defineProperty(window, 'Capacitor', {
      configurable: true,
      value: { isNativePlatform: () => true },
    });
    vi.stubEnv('VITE_ANDROID_BUILD_TYPE', 'Release');
    localStorage.clear();
    const wrapper = mount(LoginView, { global: { stubs: { AppIcon: true } } });
    try {
      await wrapper.find('.server-status-btn').trigger('click');
      expect(
        wrapper.findAll('.preset-chip').some((button) => button.text().includes('192.168.1.14')),
      ).toBe(false);
      expect(wrapper.find('.server-input').attributes('placeholder')).toContain('HTTPS');
      await wrapper.find('.server-input').setValue('http://192.168.1.14:3000');
      await wrapper.find('.btn-test').trigger('click');
      await flushPromises();
      expect(get).not.toHaveBeenCalled();
      expect(wrapper.find('.test-box').text()).toContain('نسخة الموبايل تتطلب رابط HTTPS');
      expect(wrapper.find('.btn-test').attributes('disabled')).toBeUndefined();
    } finally {
      wrapper.unmount();
      if (previous) Object.defineProperty(window, 'Capacitor', previous);
      else Reflect.deleteProperty(window, 'Capacitor');
    }
  });

  it('rejects an untrusted HTTPS server before sending a health request', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const get = vi.spyOn(axios, 'get').mockResolvedValue({ data: {} });
    localStorage.clear();
    const wrapper = mount(LoginView, { global: { stubs: { AppIcon: true } } });
    try {
      await wrapper.find('.server-status-btn').trigger('click');
      await wrapper.find('.server-input').setValue('https://untrusted.example');
      await wrapper.find('.btn-test').trigger('click');
      await flushPromises();
      expect(get).not.toHaveBeenCalled();
      expect(wrapper.find('.test-box').text()).toContain('موثوق');
      expect(wrapper.find('.btn-test').attributes('disabled')).toBeUndefined();
    } finally {
      wrapper.unmount();
    }
  });

  it('renders login form properly', () => {
    // jsdom has no rendering context; this test exercises the form, not canvas rendering.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const wrapper = mount(LoginView, {
      global: {
        stubs: {
          AppIcon: true,
        },
      },
    });
    try {
      expect(wrapper.exists()).toBe(true);

      // Check if the submit button exists
      const button = wrapper.find('button[type="submit"]');
      expect(button.exists()).toBe(true);
      expect(button.text()).toContain('تسجيل الدخول');
    } finally {
      wrapper.unmount();
    }
  });
});
