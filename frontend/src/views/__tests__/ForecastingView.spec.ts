import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import ForecastingView from '../ForecastingView.vue';

const api = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/api', () => ({
  forecasting: {
    get: api.get,
    getStaffingForecast: vi.fn().mockResolvedValue({ data: {} }),
    getSmartPricingAlerts: vi.fn().mockResolvedValue({ data: [] }),
    getCashFlowProjection: vi.fn().mockResolvedValue({ data: {} }),
  },
  warehouses: vi.fn().mockResolvedValue({ data: [{ id: 2, name_ar: 'المحل', code: 'STORE' }] }),
}));
let wrapper: VueWrapper | undefined;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-04T22:30:00Z'));
  api.get.mockReset().mockResolvedValue({ data: { business_date: '2026-10-05' } });
});
afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
async function openSales() {
  wrapper = mount(ForecastingView, {
    global: {
      stubs: {
        AppIcon: true,
        RunwayTab: true,
        SalesForecastTab: true,
        IngredientsForecastTab: true,
      },
    },
  });
  await flushPromises();
  await wrapper.findAll('.tabs button')[1]!.trigger('click');
  return wrapper;
}
const labels = () => wrapper!.findComponent({ name: 'SalesForecastTab' }).props('nextDaysLabels');

it.each(['UTC', 'America/Los_Angeles', 'Africa/Cairo'])(
  'labels the server report day consistently in %s',
  async (timezone) => {
    vi.stubEnv('TZ', timezone);
    await openSales();
    expect(labels()[0]).toEqual({ weekday: 'الثلاثاء', date: '6/10' });
    expect(labels()[6]).toEqual({ weekday: 'الإثنين', date: '12/10' });
    await wrapper!.findAll('.tabs button')[2]!.trigger('click');
    expect(
      wrapper!.findComponent({ name: 'IngredientsForecastTab' }).props('nextDaysLabels'),
    ).toEqual(labelsForOct5);
  },
);
const labelsForOct5 = [
  { weekday: 'الثلاثاء', date: '6/10' },
  { weekday: 'الأربعاء', date: '7/10' },
  { weekday: 'الخميس', date: '8/10' },
  { weekday: 'الجمعة', date: '9/10' },
  { weekday: 'السبت', date: '10/10' },
  { weekday: 'الأحد', date: '11/10' },
  { weekday: 'الإثنين', date: '12/10' },
];
it('uses the server snapshot when the request crosses midnight', async () => {
  api.get.mockImplementation(async () => {
    vi.setSystemTime(new Date('2026-10-05T22:30:00Z'));
    return { data: { business_date: '2026-10-05' } };
  });
  await openSales();
  expect(labels()).toEqual(labelsForOct5);
});
it.each([undefined, '2026-02-30', 'bad date'])(
  'falls back to Cairo at request start for an older or invalid report date: %s',
  async (businessDate) => {
    vi.stubEnv('TZ', 'UTC');
    api.get.mockImplementation(async () => {
      vi.setSystemTime(new Date('2026-10-05T22:30:00Z'));
      return { data: { business_date: businessDate } };
    });
    await openSales();
    expect(labels()).toEqual(labelsForOct5);
  },
);
it('refreshes the labels with the next report on a page left open across midnight', async () => {
  await openSales();
  api.get.mockResolvedValue({ data: { business_date: '2026-10-06' } });
  vi.setSystemTime(new Date('2026-10-05T22:30:00Z'));
  await wrapper!.find('select').trigger('change');
  await flushPromises();
  expect(labels()[0]).toEqual({ weekday: 'الأربعاء', date: '7/10' });
});
