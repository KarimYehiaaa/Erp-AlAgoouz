import { beforeEach, expect, it, vi } from 'vitest';
import XLSX from 'xlsx';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  createProduct: vi.fn(),
  updateProduct: vi.fn(),
  lockCategoryHierarchy: vi.fn(),
}));
vi.mock('../src/database/pool.ts', () => ({
  query: mocks.query,
  getClient: vi.fn(async () => ({ query: mocks.query, release: vi.fn() })),
}));
vi.mock('../src/services/productService.ts', () => ({
  createProduct: mocks.createProduct,
  updateProduct: mocks.updateProduct,
  lockCategoryHierarchy: mocks.lockCategoryHierarchy,
}));
vi.mock('../src/services/warehouseService.ts', () => ({ getWarehouseIdByCode: vi.fn() }));
import {
  parseProductsExcel,
  importProductsFromExcel,
  exportProductsToExcel,
} from '../src/services/productsExcelService.ts';

const file = (extra: Record<string, unknown> = {}) => {
  const values = {
    sku: 'COFFEE',
    name_ar: 'بن',
    category: 'coffee',
    unit: 'كجم',
    sale_price: 20,
    ...extra,
  };
  const book = XLSX.utils.book_new();
  const entries = Object.entries(values).filter(([, value]) => value !== undefined);
  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.aoa_to_sheet([entries.map(([key]) => key), entries.map(([, value]) => value)]),
    'products',
  );
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.query.mockImplementation(async (sql: string) => {
    if (sql.includes('SELECT id, slug, name_ar'))
      return { rows: [{ id: 3, slug: 'coffee', name_ar: 'بن' }] };
    if (sql.includes('SELECT id, code'))
      return {
        rows: [
          { id: 11, code: 'MAIN' },
          { id: 12, code: 'STORE' },
        ],
      };
    return { rows: [] };
  });
  mocks.createProduct.mockResolvedValue({ id: 1 });
});

it('keeps wholesale price separate from sale price', async () => {
  expect((await parseProductsExcel(file({ wholesale_price: 15 }))).rows[0]).toMatchObject({
    sale_price: 20,
    wholesale_price: 15,
  });
});

it.each([
  [
    { sale_price: '20,5', purchase_price: '١٠٫٥', wholesale_price: '۱۵٫۵' },
    { sale_price: 20.5, purchase_price: 10.5, wholesale_price: 15.5 },
  ],
  [{ main_stock: '١٬٠٠٠', store_stock: '1,5' }, { initial_stock: { 11: 1000, 12: 1.5 } }],
])('preserves localized product prices and balances: %j', async (extra, expected) => {
  expect((await parseProductsExcel(file(extra))).rows[0]).toMatchObject(expected);
});

it.each([
  { purchase_price: 'invalid' },
  { purchase_price: -1 },
  { wholesale_price: 'invalid' },
  { wholesale_price: -1 },
  { min_stock: 'invalid' },
  { min_stock: -1 },
  { main_stock: 'invalid' },
  { main_stock: -1 },
  { store_stock: 'invalid' },
  { store_stock: -1 },
])('rejects invalid optional numeric fields before importing: %j', async (extra) => {
  await expect(importProductsFromExcel(file(extra), 7)).rejects.toThrow();
  expect(mocks.createProduct).not.toHaveBeenCalled();
  expect(mocks.updateProduct).not.toHaveBeenCalled();
});

it('continues accepting omitted optional prices and stock fields', async () => {
  expect((await parseProductsExcel(file())).rows[0]).toMatchObject({
    purchase_price: 0,
    wholesale_price: null,
    min_stock: 5,
  });
});

it('does not treat an unrelated customer code as SKU', async () => {
  await expect(
    parseProductsExcel(file({ sku: undefined, 'كود العميل': 'CUSTOMER' })),
  ).rejects.toThrow('sku');
});

it('defers creating a constructor category until the import transaction', async () => {
  mocks.query.mockImplementation(async (sql: string) => {
    if (sql.includes('SELECT id, code')) return { rows: [] };
    if (sql.includes('INSERT INTO product_categories')) return { rows: [{ id: 4 }] };
    return { rows: [] };
  });
  expect(
    (await parseProductsExcel(file({ category: 'constructor' }))).rows[0].category_id,
  ).toBeNull();
  expect(
    mocks.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO product_categories')),
  ).toBe(false);
  expect(await importProductsFromExcel(file({ category: 'constructor' }), 7)).toMatchObject({
    success: 1,
    created: 1,
  });
  expect(mocks.createProduct).toHaveBeenCalledWith(
    expect.objectContaining({ category_id: 4 }),
    expect.anything(),
  );
  expect(
    mocks.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO product_categories')),
  ).toBe(true);
});

it.each([1, true, '١', '۱', 'yes', 'نشط'])(
  'keeps an explicitly active product active: %s',
  async (is_active) => {
    expect((await parseProductsExcel(file({ is_active }))).rows[0].is_active).toBe(true);
  },
);

it.each([0, false, '٠', '۰', 'no', 'غير نشط'])(
  'accepts an explicit inactive value: %s',
  async (is_active) => {
    expect((await parseProductsExcel(file({ is_active }))).rows[0].is_active).toBe(false);
  },
);

it.each(['tru', 'unknown', 2])(
  'rejects an unknown activity value instead of silently deactivating: %s',
  async (is_active) => {
    await expect(importProductsFromExcel(file({ is_active }), 7)).rejects.toThrow('is_active');
    expect(mocks.createProduct).not.toHaveBeenCalled();
    expect(mocks.updateProduct).not.toHaveBeenCalled();
  },
);

it('preserves zero min_stock through product export and parsing', async () => {
  const lookup = mocks.query.getMockImplementation()!;
  mocks.query.mockImplementation(async (sql: string) =>
    sql.includes('p.sku,')
      ? {
          rows: [
            {
              sku: 'COFFEE',
              name_ar: 'بن',
              category_name: 'coffee',
              unit: 'كجم',
              sale_price: 20,
              purchase_price: 0,
              wholesale_price: null,
              min_stock: 0,
              is_active: 1,
              main_stock: 0,
              store_stock: 0,
            },
          ],
        }
      : lookup(sql),
  );
  expect((await parseProductsExcel(await exportProductsToExcel())).rows[0].min_stock).toBe(0);
});
