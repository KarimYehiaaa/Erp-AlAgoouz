import { beforeEach, expect, it, vi } from 'vitest';
import XLSX from 'xlsx';

const mocks = vi.hoisted(() => ({ query: vi.fn(), remove: vi.fn(), importRows: vi.fn() }));
vi.mock('../src/database/pool.ts', () => ({ query: mocks.query }));
vi.mock('../src/services/salesService.ts', () => ({
  deleteAllSales: mocks.remove,
  importDailySales: mocks.importRows,
}));
import { importFromExcel } from '../src/services/salesExcelService.ts';

const workbook = (rows: unknown[][]) => {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.aoa_to_sheet([['sale_date', 'sale_type', 'total_amount', 'action'], ...rows]),
    'sales',
  );
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
};
const deletion = ['', '', '', 'delete_all'];
const validSale = ['2026-10-06', 'retail', 100, ''];
beforeEach(() => {
  vi.clearAllMocks();
  mocks.query.mockResolvedValue({ rows: [{ role_name: 'admin' }] });
  mocks.remove.mockResolvedValue({ deletedCount: 3 });
  mocks.importRows.mockResolvedValue({ success: 1, failed: [], total: 1 });
});

it('blocks a sales creator from deleting all sales through a confirmed Excel command', async () => {
  mocks.query.mockResolvedValue({ rows: [{ role_name: 'cashier' }] });
  await expect(
    importFromExcel(workbook([deletion]), 42, { confirm: 'CONFIRM_DELETE_ALL_SALES' }),
  ).rejects.toMatchObject({ statusCode: 403 });
  expect(mocks.remove).not.toHaveBeenCalled();
  expect(mocks.importRows).not.toHaveBeenCalled();
});

it('requires explicit confirmation even for an administrator deletion file', async () => {
  await expect(importFromExcel(workbook([deletion]), 42)).rejects.toMatchObject({
    statusCode: 400,
  });
  expect(mocks.remove).not.toHaveBeenCalled();
});

it('rejects a missing or inactive account before deletion', async () => {
  mocks.query.mockResolvedValue({ rows: [] });
  await expect(
    importFromExcel(workbook([deletion]), 42, { confirm: 'CONFIRM_DELETE_ALL_SALES' }),
  ).rejects.toMatchObject({ statusCode: 403 });
  expect(mocks.remove).not.toHaveBeenCalled();
});

it.each([validSale, ['invalid-date', 'retail', 100, '']])(
  'rejects mixed deletion and import before removing any existing sales: %j',
  async (...row) => {
    await expect(
      importFromExcel(workbook([deletion, row]), 42, { confirm: 'CONFIRM_DELETE_ALL_SALES' }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.importRows).not.toHaveBeenCalled();
  },
);

it('keeps an explicitly confirmed administrator-only deletion command available', async () => {
  const result = await importFromExcel(workbook([deletion]), 42, {
    confirm: 'CONFIRM_DELETE_ALL_SALES',
  });
  expect(mocks.remove).toHaveBeenCalledWith(42);
  expect(mocks.importRows).not.toHaveBeenCalled();
  expect(result.deletedCount).toBe(3);
});

it('continues ordinary sales import without requesting destructive authorization', async () => {
  const result = await importFromExcel(workbook([validSale]), 42);
  expect(result.success).toBe(1);
  expect(mocks.query).not.toHaveBeenCalled();
  expect(mocks.remove).not.toHaveBeenCalled();
});
