import { beforeEach, expect, it, vi } from 'vitest';
import XLSX from 'xlsx';

const mocks = vi.hoisted(() => ({ query: vi.fn(), createDailySale: vi.fn() }));
vi.mock('../src/database/pool.ts', () => ({ query: mocks.query }));
vi.mock('../src/services/salesService.ts', () => ({ createDailySale: mocks.createDailySale }));
vi.mock('../src/services/warehouseService.ts', () => ({ getDefaultWarehouseId: vi.fn() }));
import { importPosExcel, parsePosSalesExcel } from '../src/services/posSalesExcelService.ts';

const workbook = (quantity: unknown, price: unknown) => {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.aoa_to_sheet([
      ['sale_date', 'sku', 'quantity', 'unit_price'],
      ['2026-10-06', 'COFFEE', quantity, price],
    ]),
    'sales',
  );
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.query.mockResolvedValue({ rows: [{ id: 1, sku: 'COFFEE', name_ar: 'بن' }] });
  mocks.createDailySale.mockResolvedValue({ id: 1 });
});

it.each([
  ['1,5', '20,5', 1.5, 20.5],
  ['١٫٥', '٢٠٫٥', 1.5, 20.5],
  ['۱٫۵', '۲۰٫۵', 1.5, 20.5],
  ['١٬٠٠٠', '1,250.50', 1000, 1250.5],
  ['1,000', '1.250,50', 1000, 1250.5],
  [2, 20, 2, 20],
])(
  'preserves quantity %s and unit price %s through parsing and sale creation',
  async (quantity, price, expectedQuantity, expectedPrice) => {
    const buffer = workbook(quantity, price);
    const parsed = await parsePosSalesExcel(buffer, 11);
    expect(parsed.errors).toEqual([]);
    expect(parsed.groups[0].items[0]).toMatchObject({
      quantity: expectedQuantity,
      unit_price: expectedPrice,
    });
    const imported = await importPosExcel(buffer, 7, 11);
    expect(imported).toMatchObject({ success: 1, itemsImported: 1, failed: [], parseErrors: [] });
    expect(mocks.createDailySale).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [expect.objectContaining({ quantity: expectedQuantity, unit_price: expectedPrice })],
      }),
      7,
    );
  },
);

it.each([
  ['1l', 20],
  ['1.000.5', 20],
  [2, '20l'],
  [2, '1,2,3'],
])('rejects malformed numeric cells %s / %s without creating a sale', async (quantity, price) => {
  const imported = await importPosExcel(workbook(quantity, price), 7, 11);
  expect(imported).toMatchObject({ success: 0, itemsImported: 0 });
  expect(imported.parseErrors).toHaveLength(1);
  expect(mocks.createDailySale).not.toHaveBeenCalled();
});
