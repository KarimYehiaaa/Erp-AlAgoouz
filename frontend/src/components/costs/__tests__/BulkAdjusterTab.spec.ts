import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
const api = vi.hoisted(() => ({ bulkAdjustPrices: vi.fn(), bulkAdjustmentStatus: vi.fn() }));
vi.mock('@/api', () => ({ products: api }));
const context = vi.hoisted(() => ({ scope: 'http://shop::1' }));
vi.mock('@/api/client', () => ({ getApiCacheScope: () => context.scope }));
import BulkAdjusterTab from '../BulkAdjusterTab.vue';
let wrapper: VueWrapper | undefined;
beforeEach(() => {
  localStorage.clear();
  context.scope = 'http://shop::1';
  api.bulkAdjustPrices.mockReset().mockResolvedValue({ data: { updatedCount: 2 } });
  api.bulkAdjustmentStatus
    .mockReset()
    .mockResolvedValue({ data: { state: 'completed', updatedCount: 2 } });
  vi.stubGlobal(
    'confirm',
    vi.fn(() => true),
  );
});

it('reviews an expired operation without sending another price adjustment', async () => {
  api.bulkAdjustPrices.mockRejectedValueOnce({ message: 'انقطع الاتصال' });
  const view = await open();
  await view.find('button').trigger('click');
  await flushPromises();
  const firstKey = api.bulkAdjustPrices.mock.calls[0][1];
  view.unmount();
  const time = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 25 * 60 * 60 * 1000);
  try {
    wrapper = mount(BulkAdjusterTab, { props: { categories: [] } });
    await wrapper.find('[data-test="review-adjustment"]').trigger('click');
    await flushPromises();
    expect(api.bulkAdjustmentStatus).toHaveBeenCalledWith(firstKey);
    expect(api.bulkAdjustPrices).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('alagoouz:pending-price-adjustment:v1:http://shop::1')).toBeNull();
    expect(wrapper.text()).toContain('سبق تعديل أسعار 2 منتجات');
    expect(wrapper.emitted('reload')).toHaveLength(1);
  } finally {
    time.mockRestore();
  }
});

it.each(['processing', 'absent', 'unconfirmed'])(
  'retains the operation when review returns %s',
  async (state) => {
    api.bulkAdjustPrices.mockRejectedValueOnce({ message: 'انقطع الاتصال' });
    api.bulkAdjustmentStatus.mockResolvedValueOnce({ data: { state } });
    const view = await open();
    await view.find('button').trigger('click');
    await flushPromises();
    await view.find('[data-test="review-adjustment"]').trigger('click');
    await flushPromises();
    expect(api.bulkAdjustPrices).toHaveBeenCalledTimes(1);
    expect(
      localStorage.getItem('alagoouz:pending-price-adjustment:v1:http://shop::1'),
    ).not.toBeNull();
    expect(view.find('[data-test="review-adjustment"]').exists()).toBe(true);
    expect(view.emitted('reload')).toBeUndefined();
  },
);

it('restores an uncertain operation and reuses its key after the screen is reopened', async () => {
  api.bulkAdjustPrices.mockRejectedValueOnce({ message: 'انقطع الاتصال' });
  const view = await open();
  await view.find('select').setValue('3');
  await view.find('button').trigger('click');
  await flushPromises();
  const [firstPayload, firstKey] = api.bulkAdjustPrices.mock.calls[0];
  view.unmount();
  wrapper = mount(BulkAdjusterTab, { props: { categories: [{ id: 3, name_ar: 'بن' }] } });
  expect(wrapper.find('input').element.value).toBe('10');
  expect(wrapper.find('select').element.value).toBe('3');
  await wrapper.find('button').trigger('click');
  await flushPromises();
  expect(api.bulkAdjustPrices.mock.calls[1]).toEqual([firstPayload, firstKey]);
});

it('blocks submission when the pending operation cannot be saved durably', async () => {
  const view = await open();
  const storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('storage blocked');
  });
  try {
    await view.find('button').trigger('click');
    await flushPromises();
    expect(api.bulkAdjustPrices).not.toHaveBeenCalled();
  } finally {
    storage.mockRestore();
  }
});

it('does not resend an old operation after the safe replay window', async () => {
  api.bulkAdjustPrices.mockRejectedValueOnce({ message: 'انقطع الاتصال' });
  const view = await open();
  await view.find('button').trigger('click');
  await flushPromises();
  view.unmount();
  const time = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 25 * 60 * 60 * 1000);
  try {
    wrapper = mount(BulkAdjusterTab, { props: { categories: [{ id: 3, name_ar: 'بن' }] } });
    await wrapper.find('input').setValue(10);
    await wrapper.find('button').trigger('click');
    await flushPromises();
    expect(api.bulkAdjustPrices).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain('راجع نتيجة التعديل');
  } finally {
    time.mockRestore();
  }
});

it('isolates recovery between accounts and server addresses', async () => {
  api.bulkAdjustPrices.mockRejectedValueOnce({ message: 'انقطع الاتصال' });
  const first = await open();
  await first.find('button').trigger('click');
  await flushPromises();
  const firstKey = api.bulkAdjustPrices.mock.calls[0][1];
  first.unmount();
  context.scope = 'http://shop::2';
  wrapper = mount(BulkAdjusterTab, { props: { categories: [] } });
  expect(wrapper.find('input').element.value).toBe('0');
  wrapper.unmount();
  context.scope = 'https://cloud::1';
  wrapper = mount(BulkAdjusterTab, { props: { categories: [] } });
  expect(wrapper.find('input').element.value).toBe('0');
  wrapper.unmount();
  context.scope = 'http://shop::1';
  wrapper = mount(BulkAdjusterTab, { props: { categories: [] } });
  await wrapper.find('button').trigger('click');
  await flushPromises();
  expect(api.bulkAdjustPrices.mock.calls[1][1]).toBe(firstKey);
});

it('fails closed when the recovery entry is malformed instead of discarding it', async () => {
  localStorage.setItem('alagoouz:pending-price-adjustment:v1:http://shop::1', '{broken');
  const view = await open();
  await view.find('button').trigger('click');
  await flushPromises();
  expect(api.bulkAdjustPrices).not.toHaveBeenCalled();
  expect(localStorage.getItem('alagoouz:pending-price-adjustment:v1:http://shop::1')).toBe(
    '{broken',
  );
});

it('blocks the old form if the account or server changes before submission', async () => {
  const view = await open();
  context.scope = 'https://cloud::2';
  await view.find('button').trigger('click');
  await flushPromises();
  expect(api.bulkAdjustPrices).not.toHaveBeenCalled();
});

it('keeps recovery after a successful response when removing the saved operation fails', async () => {
  const view = await open();
  const removal = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
    throw new Error('storage blocked');
  });
  await view.find('button').trigger('click');
  await flushPromises();
  const firstKey = api.bulkAdjustPrices.mock.calls[0][1];
  removal.mockRestore();
  view.unmount();
  wrapper = mount(BulkAdjusterTab, { props: { categories: [] } });
  await wrapper.find('button').trigger('click');
  await flushPromises();
  expect(api.bulkAdjustPrices.mock.calls[1][1]).toBe(firstKey);
  expect(localStorage.getItem('alagoouz:pending-price-adjustment:v1:http://shop::1')).toBeNull();
});
afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  vi.unstubAllGlobals();
});
const open = async () => {
  wrapper = mount(BulkAdjusterTab, { props: { categories: [{ id: 3, name_ar: 'بن' }] } });
  await wrapper.find('input').setValue(10);
  return wrapper;
};
it('sends explicit all-products scope after the user confirms it', async () => {
  const view = await open();
  await view.find('button').trigger('click');
  await flushPromises();
  expect(api.bulkAdjustPrices).toHaveBeenCalledWith(
    expect.objectContaining({ all_products: true, category_id: null, value: 10 }),
    expect.any(String),
  );
  expect(view.emitted('reload')).toHaveLength(1);
});
it('keeps a selected category scoped instead of requesting all products', async () => {
  const view = await open();
  await view.find('select').setValue('3');
  await view.find('button').trigger('click');
  await flushPromises();
  expect(api.bulkAdjustPrices).toHaveBeenCalledWith(
    expect.objectContaining({ all_products: false, category_id: 3 }),
    expect.any(String),
  );
});
it('does not submit an adjustment if the confirmation is cancelled', async () => {
  vi.stubGlobal(
    'confirm',
    vi.fn(() => false),
  );
  const view = await open();
  await view.find('button').trigger('click');
  await flushPromises();
  expect(api.bulkAdjustPrices).not.toHaveBeenCalled();
});

it('retains the operation key when retrying an unconfirmed response', async () => {
  api.bulkAdjustPrices.mockRejectedValueOnce({ status: 503, message: 'نتيجة غير مؤكدة' });
  const view = await open();
  await view.find('button').trigger('click');
  await flushPromises();
  const firstKey = api.bulkAdjustPrices.mock.calls[0][1];
  expect(firstKey).toEqual(expect.any(String));
  await view.find('button').trigger('click');
  await flushPromises();
  expect(api.bulkAdjustPrices).toHaveBeenCalledTimes(2);
  expect(api.bulkAdjustPrices.mock.calls[1][1]).toBe(firstKey);
});

it('blocks a changed adjustment until the earlier uncertain result has been reviewed', async () => {
  api.bulkAdjustPrices.mockRejectedValueOnce({ message: 'انقطع الاتصال' });
  const view = await open();
  await view.find('button').trigger('click');
  await flushPromises();
  await view.find('input').setValue(20);
  await view.find('button').trigger('click');
  await flushPromises();
  expect(api.bulkAdjustPrices).toHaveBeenCalledTimes(1);
  expect(view.text()).toContain('راجع نتيجة التعديل السابق');
});

it('allows a corrected request with a new key after confirmed validation rejection', async () => {
  api.bulkAdjustPrices.mockRejectedValueOnce({ status: 400, message: 'القيمة غير صالحة' });
  const view = await open();
  await view.find('button').trigger('click');
  await flushPromises();
  await view.find('input').setValue(20);
  await view.find('button').trigger('click');
  await flushPromises();
  expect(api.bulkAdjustPrices).toHaveBeenCalledTimes(2);
  expect(api.bulkAdjustPrices.mock.calls[1][1]).not.toBe(api.bulkAdjustPrices.mock.calls[0][1]);
});
