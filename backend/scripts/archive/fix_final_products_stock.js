/**
 * fix_final_products_stock.js
 *
 * يحسب المخزون الصحيح لكل منتج نهائي (له وصفة نشطة) بناءً على:
 *   الصحيح = مجموع opening_production فقط في warehouse الافتتاحي
 *
 * كل ما زاد (من إنتاج حقيقي أو transfers أو corrections) يُطرح.
 *
 * node scripts/fix_final_products_stock.js          ← dry-run
 * node scripts/fix_final_products_stock.js --apply  ← تطبيق
 */

import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config();

const APPLY = process.argv.includes('--apply');

const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('=== تصحيح مخزون المنتجات النهائية ===');
    console.log(APPLY ? '*** وضع التطبيق ***' : '*** dry-run ***');
    console.log('');

    // 1) جلب كل المنتجات التي لها وصفة نشطة
    const recipesRes = await client.query(`
      SELECT DISTINCT r.product_id
      FROM product_recipes r
      WHERE r.deleted_at IS NULL AND r.is_active = TRUE
    `);

    if (!recipesRes.rowCount) {
      console.log('لا توجد وصفات نشطة.');
      await client.query('ROLLBACK');
      return;
    }

    const productIds = recipesRes.rows.map(r => r.product_id);
    console.log(`منتجات لها وصفات: ${productIds.join(', ')}\n`);

    let totalFixed = 0;

    for (const productId of productIds) {

      // 2) المخزون الصحيح:
      //    نبدأ بـ opening_production في warehouses الافتتاحية
      //    ثم نطبّق الـ transfers التي reference_type = 'recipe_stock_consolidation'
      //    (هذه تحويلات مقصودة لمخزون الرصيد الافتتاحي وليست نتيجة إنتاج)

      const openingRes = await client.query(`
        SELECT to_warehouse_id AS warehouse_id, SUM(quantity) AS qty
        FROM stock_movements
        WHERE product_id    = $1
          AND movement_type = 'opening_production'
        GROUP BY to_warehouse_id
      `, [productId]);

      // ابدأ بالرصيد الافتتاحي
      const correctMap = new Map(
        openingRes.rows.map(r => [Number(r.warehouse_id), Number(r.qty)])
      );

      // طبّق التحويلات المقصودة على الرصيد الافتتاحي فقط
      const transferRes = await client.query(`
        SELECT from_warehouse_id, to_warehouse_id, SUM(quantity) AS qty
        FROM stock_movements
        WHERE product_id     = $1
          AND movement_type  = 'transfer'
          AND reference_type = 'recipe_stock_consolidation'
        GROUP BY from_warehouse_id, to_warehouse_id
      `, [productId]);

      for (const t of transferRes.rows) {
        const from    = Number(t.from_warehouse_id);
        const to      = Number(t.to_warehouse_id);
        const tqty    = Number(t.qty);
        const fromBal = correctMap.get(from) || 0;
        // انقل بحد أقصى ما هو موجود من الرصيد الافتتاحي
        const moved   = Math.min(tqty, fromBal);
        if (moved > 0) {
          correctMap.set(from, fromBal - moved);
          correctMap.set(to, (correctMap.get(to) || 0) + moved);
        }
      }

      // 3) المخزون الحالي الفعلي في الداتابيز
      const currentRes = await client.query(`
        SELECT warehouse_id, COALESCE(quantity, 0) AS current_qty
        FROM inventory
        WHERE product_id = $1
      `, [productId]);

      const currentMap = new Map(
        currentRes.rows.map(r => [Number(r.warehouse_id), Number(r.current_qty)])
      );

      // كل الـ warehouses المتأثرة (حالية + صحيحة)
      const allWarehouses = new Set([
        ...currentMap.keys(),
        ...correctMap.keys(),
      ]);

      let hasChange = false;
      for (const wh of allWarehouses) {
        if (!wh) continue;
        const current = currentMap.get(wh) || 0;
        const correct = correctMap.get(wh) || 0;
        const diff    = current - correct; // موجب = زيادة تُطرح / سالب = نقص يُضاف

        if (Math.abs(diff) < 0.0001) continue;
        hasChange = true;

        console.log(`  product=${productId} warehouse=${wh}: حالي=${current.toFixed(3)} → صحيح=${correct.toFixed(3)} (${diff > 0 ? 'طرح' : 'إضافة'} ${Math.abs(diff).toFixed(3)})`);

        if (!APPLY) continue;

        // ضبط inventory
        await client.query(`
          UPDATE inventory
          SET quantity = $1, updated_at = NOW()
          WHERE product_id = $2 AND warehouse_id = $3
        `, [correct, productId, wh]);

        // تسجيل حركة تصحيح
        if (diff > 0) {
          // طرح الزيادة — from_warehouse يدل على النقص
          await client.query(`
            INSERT INTO stock_movements
              (product_id, from_warehouse_id, movement_type, quantity,
               reference_type, notes, created_at)
            VALUES ($1, $2, 'adjustment', $3, 'final_product_correction',
                   'تصحيح مخزون منتج نهائي — طرح زيادة الإنتاج الملغي', NOW())
          `, [productId, wh, diff]);
        } else {
          // إضافة نقص — to_warehouse
          await client.query(`
            INSERT INTO stock_movements
              (product_id, to_warehouse_id, movement_type, quantity,
               reference_type, notes, created_at)
            VALUES ($1, $2, 'adjustment', $3, 'final_product_correction',
                   'تصحيح مخزون منتج نهائي — إضافة رصيد ناقص', NOW())
          `, [productId, wh, Math.abs(diff)]);
        }

        totalFixed++;
      }

      if (!hasChange) {
        console.log(`  product=${productId}: ✓ مخزون صحيح بالفعل`);
      }
    }

    console.log('');

    if (APPLY) {
      await client.query(`
        INSERT INTO activity_logs (user_id, module, action_ar, details)
        VALUES (1, 'recipes', 'تصحيح مخزون المنتجات النهائية بعد تصفير الإنتاج', $1)
      `, [JSON.stringify({ products: productIds, rows_fixed: totalFixed })]);

      await client.query('COMMIT');
      console.log('=== تم التطبيق بنجاح ===\n');

      // عرض المخزون النهائي
      const finalRes = await client.query(`
        SELECT i.product_id, i.warehouse_id, ROUND(i.quantity::numeric,3) AS qty
        FROM inventory i
        WHERE i.product_id = ANY($1::int[])
          AND i.quantity != 0
        ORDER BY i.product_id, i.warehouse_id
      `, [productIds]);

      if (finalRes.rowCount) {
        console.log('المخزون النهائي للمنتجات المتأثرة:');
        for (const r of finalRes.rows) {
          console.log(`  product=${r.product_id} warehouse=${r.warehouse_id} qty=${r.qty}`);
        }
      } else {
        console.log('كل المنتجات النهائية أصبح مخزونها صفر (لا يوجد رصيد افتتاحي).');
      }
    } else {
      await client.query('ROLLBACK');
      console.log('=== dry-run انتهى — شغّل مع --apply للتطبيق ===');
    }

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('فشل:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
