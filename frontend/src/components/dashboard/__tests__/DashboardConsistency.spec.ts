import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import DashboardMetrics from '../DashboardMetrics.vue';
import DashboardPriorityAlerts from '../DashboardPriorityAlerts.vue';

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ hasPermission: () => true }),
}));

const global = {
  stubs: {
    RouterLink: { template: '<a><slot /></a>' },
    AppIcon: true,
    AnimatedNumber: true,
    Sparkline: true,
  },
};

beforeEach(() => localStorage.clear());

describe('dashboard reporting completeness', () => {
  it('shows that sales cost is missing beside reported profit', () => {
    const wrapper = mount(DashboardMetrics, {
      props: { stats: { month: { sales: 100, netProfit: 100, cogsBasis: 'untracked' } } },
      global,
    });
    expect(wrapper.text()).toContain('تكلفة المبيعات غير مسجلة');
    wrapper.unmount();
  });

  it('does not show missing cost when sales cost is recorded', () => {
    const wrapper = mount(DashboardMetrics, {
      props: { stats: { month: { sales: 100, netProfit: 60, cogsBasis: 'cost_stored' } } },
      global,
    });
    expect(wrapper.text()).not.toContain('تكلفة المبيعات غير مسجلة');
    wrapper.unmount();
  });

  it.each(['degraded', 'failed'])('does not claim stability after a %s risk scan', (scanStatus) => {
    const wrapper = mount(DashboardPriorityAlerts, {
      props: {
        stats: { actionCenter: { red: 0, orange: 0, yellow: 0, total: 0, alerts: [], scanStatus } },
      },
      global,
    });
    expect(wrapper.text()).toContain('فحص التنبيهات غير مكتمل');
    expect(wrapper.text()).toContain('تعذر إكمال فحص التنبيهات');
    expect(wrapper.text()).not.toContain('الوضع مستقر ومنضبط');
    wrapper.unmount();
  });

  it('retains urgent alerts when another risk check fails', () => {
    const wrapper = mount(DashboardPriorityAlerts, {
      props: {
        stats: {
          actionCenter: {
            red: 1,
            orange: 0,
            yellow: 0,
            total: 1,
            alerts: [],
            scanStatus: 'degraded',
          },
        },
      },
      global,
    });
    expect(wrapper.text()).toContain('مخالفات حرجة');
    expect(wrapper.text()).toContain('تعذر إكمال فحص التنبيهات');
    wrapper.unmount();
  });

  it('shows stability after a complete scan with no alerts', () => {
    const wrapper = mount(DashboardPriorityAlerts, {
      props: {
        stats: {
          actionCenter: {
            red: 0,
            orange: 0,
            yellow: 0,
            total: 0,
            alerts: [],
            scanStatus: 'success',
          },
        },
      },
      global,
    });
    expect(wrapper.text()).toContain('الوضع مستقر ومنضبط');
    expect(wrapper.text()).not.toContain('فحص التنبيهات غير مكتمل');
    wrapper.unmount();
  });
});
