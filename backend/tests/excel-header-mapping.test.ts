import { beforeEach, expect, it, vi } from 'vitest';
import XLSX from 'xlsx';

const query = vi.hoisted(() => vi.fn());
vi.mock('../src/database/pool.ts', () => ({ query }));
vi.mock('../src/services/salesService.ts', () => ({
  createDailySale: vi.fn(),
  deleteAllSales: vi.fn(),
  importDailySales: vi.fn(),
}));
vi.mock('../src/services/warehouseService.ts', () => ({ getDefaultWarehouseId: vi.fn() }));
import { parseSalesExcel } from '../src/services/salesExcelService.ts';
import { parsePosSalesExcel } from '../src/services/posSalesExcelService.ts';

const file = (headers: string[], row: unknown[]) => {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([headers, row]), 'sales');
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
};
beforeEach(() => {
  query.mockResolvedValue({ rows: [{ id: 1, sku: 'COFFEE', name_ar: 'بن' }] });
});

it('keeps profit separate from the sale total when profit appears first', () => {
  const parsed = parseSalesExcel(
    file(
      ['profit_amount', 'total_amount', 'sale_type', 'sale_date'],
      [5, 100, 'retail', '2026-10-06'],
    ),
  );
  expect(parsed.rows[0]).toMatchObject({ total_amount: 100, profit_amount: 5 });
});

it('prefers the canonical total column over the generic amount alias', () => {
  const parsed = parseSalesExcel(
    file(['amount', 'total_amount', 'sale_type', 'sale_date'], [7, 100, 'retail', '2026-10-06']),
  );
  expect(parsed.rows[0].total_amount).toBe(100);
});

it('rejects an unrelated amount column rather than importing it as a sale total', () => {
  expect(() =>
    parseSalesExcel(file(['profit_amount', 'sale_type', 'sale_date'], [5, 'retail', '2026-10-06'])),
  ).toThrow('الحقول الأساسية');
});

it('continues accepting documented aliases with parenthesized unit annotations', () => {
  const parsed = parseSalesExcel(
    file(
      ['total_amount (EGP)', 'نوع البيع', 'sale_date (YYYY-MM-DD)'],
      [100, 'retail', '2026-10-06'],
    ),
  );
  expect(parsed.rows[0]).toMatchObject({ total_amount: 100, sale_date: '2026-10-06' });
});

it('does not mistake a customer code or total price for the POS SKU or unit price', async () => {
  const parsed = await parsePosSalesExcel(
    file(
      ['customer_code', 'sku', 'total_price', 'unit_price', 'quantity', 'sale_date'],
      ['CUSTOMER', 'COFFEE', 999, 20, 2, '2026-10-06'],
    ),
    11,
  );
  expect(parsed.errors).toEqual([]);
  expect(parsed.groups).toHaveLength(1);
  expect(parsed.groups[0].items[0]).toMatchObject({ product_id: 1, quantity: 2, unit_price: 20 });
});
