import { beforeEach, expect, it, vi } from 'vitest';
import XLSX from 'xlsx';

const mocks = vi.hoisted(() => ({ query: vi.fn(), returnProductToStock: vi.fn() }));
vi.mock('../src/database/pool.ts', () => ({ query: mocks.query }));
vi.mock('../src/services/inventoryService.ts', () => ({
  returnProductToStock: mocks.returnProductToStock,
}));
vi.mock('../src/middleware/warehouseAccess.ts', () => ({
  getAllowedWarehouses: vi.fn(async () => [11]),
}));
import {
  buildReturnTemplate,
  importReturnFromExcel,
  validateReturnExcel,
} from '../src/services/inventoryExcelService.ts';

const workbook = (rows: unknown[][]) => {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), 'returns');
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.returnProductToStock.mockResolvedValue({ warehouse_name: 'المخزن', new_quantity: 12 });
  mocks.query.mockImplementation(async (sql: string, params: unknown[]) => {
    if (sql.includes('FROM products p')) {
      return {
        rows: params[0] === 'COFFEE' ? [{ id: 1, name_ar: 'بن', has_active_recipe: false }] : [],
      };
    }
    if (sql.includes('name_ar = $1')) {
      return { rows: params[0] === 'المخزن' ? [{ id: 11 }] : [] };
    }
    return { rows: [{ id: 11, name_ar: 'المخزن' }] };
  });
});

it.each([
  [
    ['كود العميل', 'SKU', 'quantity'],
    ['CUSTOMER', 'COFFEE', 2],
  ],
  [
    ['SKU', 'current_quantity', 'quantity'],
    ['COFFEE', 999, 2],
  ],
  [
    ['SKU', 'quantity', 'warehouse_notes', 'warehouse'],
    ['COFFEE', 2, 'WRONG', 'المخزن'],
  ],
])('uses explicit return columns for preview and import: %j', async (headers, row) => {
  const buffer = workbook([headers, row]);
  const preview = await validateReturnExcel(buffer, 7, 11);
  expect(preview).toMatchObject({ ok: true, validCount: 1, errors: [] });
  expect(preview.preview[0]).toMatchObject({ sku: 'COFFEE', quantity: 2 });
  const result = await importReturnFromExcel(buffer, 7, 11);
  expect(result).toMatchObject({ success: 1, failed: [] });
  expect(mocks.returnProductToStock).toHaveBeenCalledWith(
    expect.objectContaining({ product_id: 1, warehouse_id: 11, quantity: 2 }),
    7,
  );
});

it('rejects a workbook whose only quantity column describes current stock', async () => {
  const buffer = workbook([
    ['SKU', 'current_quantity'],
    ['COFFEE', 999],
  ]);
  expect(await validateReturnExcel(buffer, 7, 11)).toMatchObject({ ok: false, validCount: 0 });
  await expect(importReturnFromExcel(buffer, 7, 11)).rejects.toThrow('صف العناوين');
  expect(mocks.returnProductToStock).not.toHaveBeenCalled();
});

it('keeps the generated Arabic return template usable', async () => {
  mocks.query.mockResolvedValueOnce({
    rows: [{ sku: 'COFFEE', name_ar: 'بن', warehouse_name: 'المخزن' }],
  });
  const template = await buildReturnTemplate(11, 7);
  const book = XLSX.read(template, { type: 'buffer' });
  const rows = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[book.SheetNames[0]], {
    header: 1,
    defval: '',
  });
  rows[5][6] = 2;
  const buffer = workbook(rows);
  expect(await validateReturnExcel(buffer, 7, 11)).toMatchObject({ ok: true, validCount: 1 });
  expect(await importReturnFromExcel(buffer, 7, 11)).toMatchObject({ success: 1, failed: [] });
});

it('accepts explicit return column names with unit annotations', async () => {
  const buffer = workbook([
    ['SKU', 'الكمية المرتجعة (كجم)'],
    ['COFFEE', 2],
  ]);
  expect(await validateReturnExcel(buffer, 7, 11)).toMatchObject({ ok: true, validCount: 1 });
});

it.each([
  ['١٬٠٠٠', 1000],
  ['1,000', 1000],
  ['1,5', 1.5],
  ['۱٫۵', 1.5],
])('preserves the localized return quantity %s', async (quantity, expected) => {
  const buffer = workbook([
    ['SKU', 'quantity'],
    ['COFFEE', quantity],
  ]);
  const preview = await validateReturnExcel(buffer, 7, 11);
  expect(preview).toMatchObject({ ok: true, validCount: 1 });
  expect(preview.preview[0].quantity).toBe(expected);
  expect(await importReturnFromExcel(buffer, 7, 11)).toMatchObject({ success: 1, failed: [] });
  expect(mocks.returnProductToStock).toHaveBeenCalledWith(
    expect.objectContaining({ quantity: expected }),
    7,
  );
});

it.each(['1l', '1I', '1|', '1.000.5'])(
  'rejects malformed quantity %s without stock writes',
  async (quantity) => {
    const buffer = workbook([
      ['SKU', 'quantity'],
      ['COFFEE', quantity],
    ]);
    expect(await validateReturnExcel(buffer, 7, 11)).toMatchObject({ ok: false, validCount: 0 });
    expect(await importReturnFromExcel(buffer, 7, 11)).toMatchObject({ success: 0 });
    expect(mocks.returnProductToStock).not.toHaveBeenCalled();
  },
);
