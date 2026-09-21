import { describe, it, expect, afterAll } from 'vitest';
import crypto from 'node:crypto';
import pool, { query } from '../src/database/pool.ts';
import { createDailySale, updateSale } from '../src/services/salesService.ts';

const SKU = 'SKU-SLR-1';
const WH_CODE = 'TST-WHSLR';
const CAT_NAME = 'تصنيف اختبار استرجاع البيع';

describe('Sale restore & sync_id idempotency integration tests', () => {
  it('Sale restore & sync_id idempotency integration tests', async () => {
    // Pre-cleanup
    await query(`DELETE FROM stock_movements WHERE notes LIKE '%TST-SLR%'`);
    await query(`DELETE FROM products WHERE sku = $1`, [SKU]);
    await query(`DELETE FROM product_categories WHERE name_ar = $1`, [CAT_NAME]);
    await query(`DELETE FROM warehouses WHERE code = $1`, [WH_CODE]);

    let whId: number | undefined;
    let catId: number | undefined;
    let pId: number | undefined;
    let userId: number;
    let sale1Id: number | undefined;
    let sale2Id: number | undefined;

    try {
      const whRes = await query(
        `INSERT INTO warehouses (code, name_ar, type, is_active)
         VALUES ($1, 'مخزن اختبار استرجاع البيع', 'main', true) RETURNING id`,
        [WH_CODE],
      );
      whId = whRes.rows[0].id;

      const catRes = await query(
        `INSERT INTO product_categories (name_ar) VALUES ($1) RETURNING id`,
        [CAT_NAME],
      );
      catId = catRes.rows[0].id;

      const prodRes = await query(
        `INSERT INTO products (sku, name_ar, purchase_price, sale_price, category_id, is_active)
         VALUES ($1, 'منتج اختبار استرجاع', 6.00, 10.00, $2, true) RETURNING id`,
        [SKU, catId],
      );
      pId = prodRes.rows[0].id;

      await query(
        `INSERT INTO inventory (product_id, warehouse_id, quantity) VALUES ($1, $2, 100.000)`,
        [pId, whId],
      );

      const userRes = await query(
        `SELECT u.id
         FROM users u
         JOIN roles r ON r.id = u.role_id
         WHERE u.deleted_at IS NULL AND r.name IN ('admin', 'sys_admin', 'owner')
         ORDER BY u.id
         LIMIT 1`,
      );
      userId = userRes.rows[0].id;

      const salePayload = {
        sale_type: 'branch',
        warehouse_id: whId,
        payment_status: 'paid',
        items: [{ product_id: pId, quantity: 5, unit_price: 10 }],
        notes: 'TST-SLR',
      };

      // --- TEST 1: إنشاء بيع يخصم المخزون مرة واحدة ---
      const sale1 = await createDailySale({ ...salePayload }, userId);
      sale1Id = sale1.id;
      let stock = await getStock(pId!);
      expect(stock).toBe(95);

      // --- TEST 2: تعديل البيع مرتين لا يغيّر المخزون (كان يضخم المخزون سابقاً) ---
      await updateSale(sale1Id!, { ...salePayload, total_amount: 50 }, userId);
      stock = await getStock(pId!);
      expect(stock).toBe(95);

      await updateSale(sale1Id!, { ...salePayload, total_amount: 50 }, userId);
      stock = await getStock(pId!);
      expect(stock).toBe(95);

      // --- TEST 3: نفس sync_id لا ينشئ بيعاً ثانياً ---
      const syncId = crypto.randomUUID();
      const s2a = await createDailySale({ ...salePayload, sync_id: syncId }, userId);
      sale2Id = s2a.id;
      expect(s2a._duplicateSync).toBeUndefined();

      const s2b = await createDailySale({ ...salePayload, sync_id: syncId }, userId);
      expect(s2b._duplicateSync).toBe(true);
      expect(Number(s2b.id)).toBe(Number(sale2Id));

      const dupCount = await query(`SELECT COUNT(*)::int AS c FROM sales WHERE sync_id = $1`, [
        syncId,
      ]);
      expect(dupCount.rows[0].c).toBe(1);

      // المخزون لم يتأثر بمحاولة الإرسال المزدوج
      stock = await getStock(pId!);
      expect(stock).toBe(90);
    } finally {
      // Cleanup
      if (sale1Id || sale2Id) {
        const ids = [sale1Id, sale2Id].filter(Boolean);
        await query(`DELETE FROM invoices WHERE sale_id = ANY($1::int[])`, [ids]);
        await query(
          `DELETE FROM payments WHERE reference_type = 'sale' AND reference_id = ANY($1::int[])`,
          [ids],
        );
        await query(`DELETE FROM sale_items WHERE sale_id = ANY($1::int[])`, [ids]);
        await query(
          `DELETE FROM stock_movements WHERE reference_type = 'sale' AND reference_id = ANY($1::int[])`,
          [ids],
        );
        await query(`DELETE FROM sales WHERE id = ANY($1::int[])`, [ids]);
      }
      await query(
        `DELETE FROM inventory WHERE product_id IN (SELECT id FROM products WHERE sku = $1)`,
        [SKU],
      );
      await query(
        `DELETE FROM activity_logs WHERE module = 'sales' AND details::text LIKE '%TST-SLR%'`,
      );
      await query(`DELETE FROM products WHERE sku = $1`, [SKU]);
      await query(`DELETE FROM product_categories WHERE name_ar = $1`, [CAT_NAME]);
      await query(`DELETE FROM warehouses WHERE code = $1`, [WH_CODE]);
    }
  });
});

async function getStock(productId: number) {
  const res = await query(
    `SELECT COALESCE(SUM(quantity), 0) AS q FROM inventory WHERE product_id = $1`,
    [productId],
  );
  return Number(res.rows[0].q);
}
