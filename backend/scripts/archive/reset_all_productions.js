/**
 * reset_all_productions.js
 *
 * يحذف كل عمليات الإنتاج الفعلي (movement_type = 'production') ويُعيد كل المكونات
 * المخصومة إلى مخازنها الأصلية، ثم يطرح المنتجات النهائية من المخزون.
 *
 * التشغيل:
 *   node scripts/reset_all_productions.js           ← dry-run (بدون تغيير)
 *   node scripts/reset_all_productions.js --apply   ← تطبيق فعلي
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

    console.log('=== إعادة تعيين كل عمليات الإنتاج ===');
    console.log(APPLY ? '*** وضع التطبيق الفعلي ***' : '*** dry-run — لا تغييرات ***');
    console.log('');

    // 1) جلب كل production movements
    const prodsRes = await client.query(`
      SELECT sm.id AS movement_id, sm.product_id, sm.quantity,
             sm.to_warehouse_id AS warehouse_id, sm.reference_id AS recipe_id, sm.created_at
      FROM stock_movements sm
      WHERE sm.movement_type = 'production'
      ORDER BY sm.created_at
    `);

    if (!prodsRes.rowCount) {
      console.log('لا توجد عمليات إنتاج.');
      await client.query('ROLLBACK');
      return;
    }

    console.log(`وجدنا ${prodsRes.rowCount} عملية إنتاج\n`);

    let totalIngredientsRestored = 0;
    let totalProductsDeducted    = 0;

    for (const prod of prodsRes.rows) {
      console.log(`── الإنتاج id=${prod.movement_id} | product=${prod.product_id} | qty=${prod.quantity} | warehouse=${prod.warehouse_id}`);

      // 2) جلب consumption movements المرتبطة (±2 دقيقة)
      const window = 120; // ثانية
      const consRes = await client.query(`
        SELECT c.id, c.product_id AS ingredient_id, c.quantity, c.from_warehouse_id
        FROM stock_movements c
        WHERE c.movement_type = 'consumption'
          AND c.reference_type = 'production'
          AND c.reference_id   = $1
          AND ABS(EXTRACT(EPOCH FROM (c.created_at - $2::timestamptz))) < $3
        ORDER BY c.id
      `, [prod.recipe_id, prod.created_at, window]);

      console.log(`   مكونات للإرجاع: ${consRes.rowCount}`);

      // 3) تحقق من المخزون الحالي للمنتج النهائي
      const invRes = await client.query(`
        SELECT COALESCE(quantity, 0) AS qty
        FROM inventory
        WHERE product_id = $1 AND warehouse_id = $2
      `, [prod.product_id, prod.warehouse_id]);

      const currentStock = Number(invRes.rows[0]?.qty || 0);
      const deductQty    = Math.min(currentStock, Number(prod.quantity));

      console.log(`   مخزون المنتج الحالي: ${currentStock} | سيُطرح: ${deductQty}`);

      for (const c of consRes.rows) {
        console.log(`   → إرجاع ingredient=${c.ingredient_id} qty=${c.quantity} إلى warehouse=${c.from_warehouse_id}`);
      }

      if (!APPLY) continue;

      // === التطبيق ===

      // أ) إرجاع كل مكون
      for (const c of consRes.rows) {
        const restoreQty = Number(c.quantity);
        if (restoreQty <= 0) continue;

        // تأكد وجود صف inventory
        await client.query(`
          INSERT INTO inventory (product_id, warehouse_id, quantity, updated_at)
          VALUES ($1, $2, 0, NOW())
          ON CONFLICT (product_id, warehouse_id, COALESCE(batch_number, '')) DO NOTHING
        `, [c.ingredient_id, c.from_warehouse_id]);

        await client.query(`
          UPDATE inventory SET quantity = quantity + $1, updated_at = NOW()
          WHERE product_id = $2 AND warehouse_id = $3
        `, [restoreQty, c.ingredient_id, c.from_warehouse_id]);

        await client.query(`
          INSERT INTO stock_movements
            (product_id, to_warehouse_id, movement_type, quantity,
             reference_type, reference_id, notes, created_at)
          VALUES ($1, $2, 'return', $3, 'production', $4, $5, NOW())
        `, [
          c.ingredient_id,
          c.from_warehouse_id,
          restoreQty,
          prod.movement_id,
          `إعادة مكون — تصفير إنتاج id:${prod.movement_id}`,
        ]);

        totalIngredientsRestored++;
      }

      // ب) طرح المنتج النهائي (بحد أقصى ما هو موجود)
      if (deductQty > 0) {
        await client.query(`
          UPDATE inventory SET quantity = quantity - $1, updated_at = NOW()
          WHERE product_id = $2 AND warehouse_id = $3
        `, [deductQty, prod.product_id, prod.warehouse_id]);

        await client.query(`
          INSERT INTO stock_movements
            (product_id, from_warehouse_id, movement_type, quantity,
             reference_type, reference_id, notes, created_at)
          VALUES ($1, $2, 'adjustment', $3, 'production', $4, $5, NOW())
        `, [
          prod.product_id,
          prod.warehouse_id,
          deductQty,
          prod.movement_id,
          `تصفير إنتاج id:${prod.movement_id}`,
        ]);

        totalProductsDeducted++;
      }

      console.log(`   ✓ تم`);
    }

    console.log('');

    if (APPLY) {
      // تسجيل في activity_logs
      await client.query(`
        INSERT INTO activity_logs (user_id, module, action_ar, details)
        VALUES (1, 'recipes', 'تصفير كل عمليات الإنتاج', $1)
      `, [JSON.stringify({
        productions_count:       prodsRes.rowCount,
        ingredients_restored:    totalIngredientsRestored,
        products_deducted:       totalProductsDeducted,
      })]);

      await client.query('COMMIT');
      console.log('=== تم التطبيق بنجاح ===');

      // عرض المخزون النهائي للمنتجات المتأثرة
      const productIds = [...new Set(prodsRes.rows.map(r => r.product_id))];
      const finalInv = await client.query(`
        SELECT i.product_id, i.warehouse_id, i.quantity
        FROM inventory i
        WHERE i.product_id = ANY($1::int[])
        ORDER BY i.product_id, i.warehouse_id
      `, [productIds]);

      console.log('\nالمخزون النهائي للمنتجات المتأثرة:');
      for (const row of finalInv.rows) {
        console.log(`  product=${row.product_id} warehouse=${row.warehouse_id} qty=${row.quantity}`);
      }
    } else {
      await client.query('ROLLBACK');
      console.log('=== dry-run انتهى — لا تغييرات ===');
      console.log('شغّل مع --apply لتطبيق التغييرات');
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
