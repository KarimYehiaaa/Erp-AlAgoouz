import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
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
  it('renders login form properly', () => {
    const wrapper = mount(LoginView, {
      global: {
        stubs: {
          AppIcon: true,
        },
      },
    });
    expect(wrapper.exists()).toBe(true);

    // Check if the submit button exists
    const button = wrapper.find('button[type="submit"]');
    expect(button.exists()).toBe(true);
    expect(button.text()).toContain('تسجيل الدخول');
  });
});
