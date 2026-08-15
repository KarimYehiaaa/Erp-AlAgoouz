import { describe, it, expect } from 'vitest';
import { getExpenses } from '../src/services/expenseService.ts';
import { getSalesSummary } from '../src/services/salesService.ts';
import { listProductionBatches } from '../src/services/recipesService.ts';
import { getProducts, getBranchProducts } from '../src/services/productService.ts';
import { listPurchaseInvoices } from '../src/services/purchaseService.ts';
import { inventoryRepository } from '../src/repositories/inventory.repository.ts';
import { invoicesRepository } from '../src/repositories/invoices.repository.ts';
import { salesRepository } from '../src/repositories/sales.repository.ts';

/**
 * اختبار انتكاس: يضمن أن ترقيم معاملات SQL ($${n}) يبقى صحيحًا عبر كل تركيبات
 * الفلاتر الممكنة. أي عدّاد (i/idx) يتوقف عن التقدم — كما حدث مع `LIMIT $${idx}`
 * بعد فلتر status — يكسر الاستعلام بخطأ bind (LIMIT/OFTSET من نوع خاطئ) فيفشل هنا.
 * هذا يغطي الإصلاح: استخدام params.length + 1 حيث كان العدّاد يتباعد عن params.
 */
describe('SQL parameter numbering (regression)', () => {
  it('all filtered queries execute correctly across filter combinations', async () => {
    const cases: [string, () => Promise<unknown>][] = [
      // inventoryRepository.getStockMovements — عدّاد i مع فلاتر اختيارية
      ...[
        {},
        { product_id: 1 },
        { warehouse_id: 1 },
        { movement_type: 'in' },
        { product_id: 1, warehouse_id: 1, movement_type: 'out' },
      ].map((f) => [`getStockMovements ${JSON.stringify(f)}`, () => inventoryRepository.getStockMovements(f)] as [string, () => Promise<unknown>]),

      // invoicesRepository.getInvoicesList — idx مع LIMIT مضمّن (بلا معامل)
      ...[
        {},
        { payment_status: 'paid' },
        { customer_id: 1 },
        { payment_status: 'paid', customer_id: 1 },
      ].map((f) => [`getInvoicesList ${JSON.stringify(f)}`, () => invoicesRepository.getInvoicesList(f)] as [string, () => Promise<unknown>]),

      // salesRepository.getSalesList — كانت مكسورة: status فقط مع LIMIT $${idx}
      ...[
        {},
        { sale_type: 'branch' },
        { status: 'completed' },
        { sale_type: 'branch', entry_mode: 'pos', from_date: '2026-01-01', to_date: '2026-08-15' },
        { status: 'completed', from_date: '2026-01-01', to_date: '2026-08-15' },
      ].map((f) => [`getSalesList ${JSON.stringify(f)}`, () => salesRepository.getSalesList({ ...f, page: 1, limit: 10 })] as [string, () => Promise<unknown>]),

      // getExpenses — i مع is_fixed آخر
      ...[
        {},
        { from_date: '2026-01-01', to_date: '2026-08-15', category_id: 1, is_fixed: true },
        { is_fixed: false },
      ].map((f) => [`getExpenses ${JSON.stringify(f)}`, () => getExpenses(f)] as [string, () => Promise<unknown>]),

      // getSalesSummary — idx حتى to_date (لا LIMIT)
      ...[
        {},
        { sale_type: 'wholesale', from_date: '2026-01-01', to_date: '2026-08-15' },
      ].map((f) => [`getSalesSummary ${JSON.stringify(f)}`, () => getSalesSummary(f)] as [string, () => Promise<unknown>]),

      // listProductionBatches — idx حتى to_date
      ...[
        {},
        { recipe_id: 1, from_date: '2026-01-01', to_date: '2026-08-15' },
      ].map((f) => [`listProductionBatches ${JSON.stringify(f)}`, () => listProductionBatches(f)] as [string, () => Promise<unknown>]),

      // getProducts — i متسلسل + LIMIT $${i}
      ...[
        {},
        { category_id: 1 },
        { search: 'قهوة' },
        { warehouse_id: 1 },
        { category_id: 1, search: 'قهوة', warehouse_id: 1, is_active: true },
        { category_id: 1, search: 'قهوة', primary_warehouse_id: 2, warehouse_id: 1, is_active: true },
      ].map((f) => [`getProducts ${JSON.stringify(f)}`, () => getProducts(f)] as [string, () => Promise<unknown>]),

      // getBranchProducts — معامل 1 ثابت (warehouseId) + فلاتر من 2
      ...[
        {},
        { category_id: 1 },
        { category_id: 1, search: 'قهوة', has_recipe: true },
      ].map((f) => [`getBranchProducts ${JSON.stringify(f)}`, () => getBranchProducts(f)] as [string, () => Promise<unknown>]),

      // listPurchaseInvoices — idx + LIMIT $${idx}
      ...[
        {},
        { from_date: '2026-01-01' },
        { to_date: '2026-08-15' },
        { from_date: '2026-01-01', to_date: '2026-08-15' },
      ].map((f) => [`listPurchaseInvoices ${JSON.stringify(f)}`, () => listPurchaseInvoices(f)] as [string, () => Promise<unknown>]),
    ];

    const errors: string[] = [];
    for (const [name, fn] of cases) {
      try {
        await fn();
      } catch (e) {
        errors.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    expect(errors, errors.join('\n')).toEqual([]);
  }, 20000);
});
