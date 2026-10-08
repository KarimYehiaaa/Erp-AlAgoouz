import { beforeEach, expect, it, vi } from 'vitest';
import XLSX from 'xlsx';

const mocks = vi.hoisted(() => ({ query: vi.fn(), createSale: vi.fn() }));
vi.mock('../src/database/pool.ts', () => ({ query: mocks.query }));
vi.mock('../src/services/salesService.ts', () => ({ createDailySale: mocks.createSale }));
vi.mock('../src/services/warehouseService.ts', () => ({ getDefaultWarehouseId: vi.fn() }));
import { buildPosTemplate, importPosExcel } from '../src/services/posSalesExcelService.ts';

const makeWorkbook = () => {
  const book = XLSX.utils.book_new();
  const rows = [['sale_date', 'sku', 'unit_price', 'quantity', 'payment_method', 'notes']];
  for (const [group, count] of [3, 1, 2].entries()) {
    for (let item = 0; item < count; item++) {
      rows.push(['2026-10-06', `SKU-${item}`, '20', '7', 'cash', `group-${group}`]);
    }
  }
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), 'sales');
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.query.mockResolvedValue({
    rows: [0, 1, 2].map((id) => ({ id: id + 1, sku: `SKU-${id}`, name_ar: `صنف ${id}` })),
  });
});

it('dates the POS template by the Cairo business day on a UTC server', async () => {
  const originalTimezone = process.env.TZ;
  process.env.TZ = 'UTC';
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-06T22:30:00Z'));
  try {
    const book = XLSX.read(await buildPosTemplate(11), { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], {
      header: 1,
    }) as string[][];
    expect(rows[1][0]).toBe('2026-10-07');
  } finally {
    vi.useRealTimers();
    if (originalTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimezone;
  }
});

it.each([
  { failedGroups: [0], expectedItems: 3 },
  { failedGroups: [1], expectedItems: 5 },
  { failedGroups: [2], expectedItems: 4 },
  { failedGroups: [0, 1, 2], expectedItems: 0 },
  { failedGroups: [], expectedItems: 6 },
])('counts only committed item lines when groups $failedGroups fail', async (scenario) => {
  mocks.createSale.mockImplementation(async (sale) => {
    const group = Number(sale.notes.split('-')[1]);
    if (scenario.failedGroups.includes(group)) throw new Error('Insufficient stock fixture');
    return { id: group + 1 };
  });
  const result = await importPosExcel(makeWorkbook(), 42, 11);
  expect(result.total).toBe(3);
  expect(result.success).toBe(3 - scenario.failedGroups.length);
  expect(result.failed).toHaveLength(scenario.failedGroups.length);
  expect(result.itemsImported).toBe(scenario.expectedItems);
  expect(result.parseErrors).toEqual([]);
  expect(mocks.createSale).toHaveBeenCalledTimes(3);
});
