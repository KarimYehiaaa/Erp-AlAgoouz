import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import QuotesView from '../QuotesView.vue';

const fixtures = vi.hoisted(() => ({ exportPdf: vi.fn(), template: vi.fn() }));
vi.mock('@/api', () => ({ quotes: { template: fixtures.template, saveTemplate: vi.fn() } }));
vi.mock('@/utils/pdfExport', () => ({ exportElementToPdf: fixtures.exportPdf }));
let wrapper: VueWrapper | undefined;
let printedDate = '';
const cairoDate = (instant: string) =>
  new Intl.DateTimeFormat('ar-EG', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(instant));

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  fixtures.template.mockResolvedValue({
    data: { items: [{ name: 'بن اختبار', unit: 'كيلو', price: 500 }] },
  });
  fixtures.exportPdf.mockReset();
  fixtures.exportPdf.mockImplementation(async () => {
    printedDate = document.querySelector('.preview-doc .meta')?.textContent || '';
  });
  printedDate = '';
});
afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

async function openQuote(instant: string) {
  vi.setSystemTime(new Date(instant));
  wrapper = mount(QuotesView, { attachTo: document.body, global: { stubs: { AppLogo: true } } });
  await flushPromises();
  await wrapper.find('input[placeholder="اسم العميل أو الشركة"]').setValue('عميل اختبار');
  return wrapper;
}

it.each(['UTC', 'America/Los_Angeles', 'Africa/Cairo'])(
  'exports the Cairo date in the document and filename on a device in %s',
  async (timezone) => {
    vi.stubEnv('TZ', timezone);
    const instant = '2026-10-04T22:30:00Z';
    const view = await openQuote(instant);
    expect(view.find('.preview-doc .meta').text()).toContain(cairoDate(instant));
    await view.find('button.btn-primary').trigger('click');
    await flushPromises();
    expect(fixtures.exportPdf).toHaveBeenCalledOnce();
    expect(fixtures.exportPdf.mock.calls[0]![0].filename).toBe('quote-2026-10-05.pdf');
    expect(printedDate).toContain(cairoDate(instant));
  },
);

it('refreshes the displayed issue day before exporting a page left open across Cairo midnight', async () => {
  vi.stubEnv('TZ', 'UTC');
  const view = await openQuote('2026-10-04T20:30:00Z');
  const exportInstant = '2026-10-04T22:30:00Z';
  vi.setSystemTime(new Date(exportInstant));
  await view.find('button.btn-primary').trigger('click');
  await flushPromises();
  expect(fixtures.exportPdf).toHaveBeenCalledOnce();
  expect(printedDate).toContain(cairoDate(exportInstant));
  expect(fixtures.exportPdf.mock.calls[0]![0].filename).toBe('quote-2026-10-05.pdf');
});
