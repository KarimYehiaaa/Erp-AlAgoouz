import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import StaffingTab from '../StaffingTab.vue';

let wrapper: VueWrapper | undefined;
const density = {
  0: {
    8: { avg_transactions: 99, avg_revenue: 990, traffic_level: 'مرتفع', recommended_staff: 3 },
  },
  1: { 8: { avg_transactions: 1, avg_revenue: 10, traffic_level: 'منخفض', recommended_staff: 1 } },
};
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-04T22:30:00Z'));
});
afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
it.each(['UTC', 'America/Los_Angeles', 'Africa/Cairo'])(
  'opens the Cairo business weekday on a device in %s',
  async (timezone) => {
    vi.stubEnv('TZ', timezone);
    wrapper = mount(StaffingTab, { props: { peakHours: [], weeklyDensity: density } });
    expect(wrapper.find('.day-btn.active').text()).toBe('الإثنين');
    expect(wrapper.find('tbody tr').text()).toContain('1 طلب / ساعة');
  },
);
it('keeps the user-selected weekday when density data refreshes', async () => {
  wrapper = mount(StaffingTab, { props: { peakHours: [], weeklyDensity: density } });
  await wrapper.findAll('.day-btn')[0]!.trigger('click');
  await wrapper.setProps({ weeklyDensity: { ...density } });
  expect(wrapper.find('.day-btn.active').text()).toBe('الأحد');
  expect(wrapper.find('tbody tr').text()).toContain('99 طلب / ساعة');
});
