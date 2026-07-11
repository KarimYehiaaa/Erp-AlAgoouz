/**
 * fix_duplicate_productions.js
 *
 * يصلح عمليات الإنتاج المكررة التي تسببت في زيادة المنتج النهائي
 * ونقص المواد الخام مرتين.
 *
 * الحالات المكتشفة:
 *  - Recipe 1  (product 74):  movement 135 مكرر  (الأصلي: 90)
 *  - Recipe 16 (product 121): movement 55  مكرر  (الأصلي: 43)
 *  - Recipe 19 (product 103): movement 57  مكرر  (الأصلي: 45)
 *
 * التشغيل:
 *   node scripts/fix_duplicate_productions.js           <- dry-run (لا يعدل شيء)
 *   node scripts/fix_duplicate_productions.js --apply   <- تطبيق التعديلات
 */

import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config();

const APPLY = process.argv.includes('--apply');

if (!process.env.DB_HOST) {
  console.error('Missing DB config in .env');
  process.exit(1);
}

const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

/**
 * كل حالة تحدد:
 *  - duplicateMovementId: id حركة الإنتاج المكررة (اللي هنعكسها)
 *  - originalMovementId:  id حركة الإنتاج الأصلية (اللي هتفضل)
 */
const DUPLICATE_CASES = [
  {
    duplicateMovementId: 135,
    originalMovementId: 90,
    description: 'Recipe 1 / product 74 - second production on 2026-06-07',
    // The 40 units (20 original + 20 duplicate) were transferred to warehouse 2,
    // so we reverse the 20 duplicate units FROM warehouse 2 (their current location).
    overrideProductWarehouse: 2,
  },
  { duplicateMovementId: 55,  originalMovementId: 43,  description: 'Recipe 16 / product 121 - duplicate in warehouse 2' },
  { duplicateMovementId: 57,  originalMovementId: 45,  description: 'Recipe 19 / product 103 - duplicate in warehouse 2' },
];

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1) Create backup table
    await client.query(`
      CREATE TABLE IF NOT EXISTS stock_movements_dup_fix_backup (
        backup_id  SERIAL PRIMARY KEY,
        fix_run_at TIMESTAMPTZ DEFAULT NOW(),
        case_desc  TEXT,
        original_id INT,
        data       JSONB
      )
    `);

    console.log('=== Duplicate Production Fix ===');
    console.log(APPLY ? '*** APPLY MODE ***' : '*** DRY-RUN MODE (no changes) ***');
    console.log('');

    for (const cas of DUPLICATE_CASES) {
      console.log(`--- Case: ${cas.description} ---`);

      // Fetch the duplicate production movement
      const mvRes = await client.query(
        `SELECT * FROM stock_movements WHERE id = $1 FOR UPDATE`,
        [cas.duplicateMovementId]
      );
      if (!mvRes.rowCount) {
        console.error(`  ERROR: movement id=${cas.duplicateMovementId} not found — skipping`);
        continue;
      }
      const mv = mvRes.rows[0];

      if (!['production', 'opening_production'].includes(mv.movement_type)) {
        console.error(`  ERROR: movement ${cas.duplicateMovementId} is type '${mv.movement_type}', expected production — skipping`);
        continue;
      }

      const reverseQty   = Number(mv.quantity);
      const productId    = mv.product_id;
      // Allow overriding the warehouse if the product was moved after production
      const toWarehouse  = cas.overrideProductWarehouse || mv.to_warehouse_id;
      const refType      = mv.reference_type;
      const refId        = mv.reference_id;

      // Find consumption movements that belong to THIS duplicate run
      // (same reference, within ±30 seconds of the duplicate movement)
      const window = 30 * 1000; // 30 seconds in ms
      const dupTime  = new Date(mv.created_at).getTime();
      const startTime = new Date(dupTime - window).toISOString();
      const endTime   = new Date(dupTime + window).toISOString();

      const consRes = await client.query(
        `SELECT * FROM stock_movements
         WHERE movement_type = 'consumption'
           AND reference_type = $1
           AND reference_id   = $2
           AND created_at BETWEEN $3 AND $4
         ORDER BY id`,
        [refType, refId, startTime, endTime]
      );

      console.log(`  Production movement id=${mv.id}, qty=${reverseQty}, product_id=${productId}, warehouse=${toWarehouse}`);
      console.log(`  Found ${consRes.rowCount} related consumption movement(s) to restore`);

      // Check current inventory of produced product
      const invProdRes = await client.query(
        `SELECT quantity FROM inventory WHERE product_id = $1 AND warehouse_id = $2`,
        [productId, toWarehouse]
      );
      const currentProdQty = Number(invProdRes.rows[0]?.quantity || 0);
      console.log(`  Current inventory of product ${productId} in warehouse ${toWarehouse}: ${currentProdQty}`);

      if (currentProdQty < reverseQty) {
        console.error(`  ERROR: Not enough stock to reverse — have ${currentProdQty}, need ${reverseQty}. Aborting case.`);
        continue;
      }

      for (const c of consRes.rows) {
        console.log(`    Restore ingredient product_id=${c.product_id}, qty=${c.quantity}, warehouse=${c.from_warehouse_id}`);
      }

      if (!APPLY) {
        console.log('  [DRY-RUN] Would apply the above corrections.');
        console.log('');
        continue;
      }

      // --- APPLY ---

      // Backup affected rows
      const affectedIds = [mv.id, ...consRes.rows.map(r => r.id)];
      for (const id of affectedIds) {
        const row = await client.query(
          `SELECT row_to_json(t) AS data FROM (SELECT * FROM stock_movements WHERE id = $1) t`,
          [id]
        );
        await client.query(
          `INSERT INTO stock_movements_dup_fix_backup (case_desc, original_id, data)
           VALUES ($1, $2, $3)`,
          [cas.description, id, row.rows[0].data]
        );
      }

      // 1) Decrease produced product inventory
      await client.query(
        `UPDATE inventory SET quantity = quantity - $1, updated_at = NOW()
         WHERE product_id = $2 AND warehouse_id = $3`,
        [reverseQty, productId, toWarehouse]
      );

      // 2) Insert reversal adjustment movement for the produced product
      // الكمية موجبة دائماً — movement_type='adjustment' مع from_warehouse يدل على النقص
      await client.query(
        `INSERT INTO stock_movements
           (product_id, from_warehouse_id, movement_type, quantity, reference_type, reference_id, notes, created_at)
         VALUES ($1, $2, 'adjustment', $3, $4, $5, $6, NOW())`,
        [
          productId,
          toWarehouse,
          Math.abs(reverseQty),
          refType,
          refId,
          `تصحيح تكرار عملية الإنتاج — عكس الحركة id:${mv.id}`,
        ]
      );

      // 3) Restore each ingredient
      for (const c of consRes.rows) {
        const restoreQty = Number(c.quantity);

        await client.query(
          `INSERT INTO inventory (product_id, warehouse_id, quantity, updated_at)
           VALUES ($1, $2, 0, NOW())
           ON CONFLICT (product_id, warehouse_id, COALESCE(batch_number,'')) DO NOTHING`,
          [c.product_id, c.from_warehouse_id]
        );

        await client.query(
          `UPDATE inventory SET quantity = quantity + $1, updated_at = NOW()
           WHERE product_id = $2 AND warehouse_id = $3`,
          [restoreQty, c.product_id, c.from_warehouse_id]
        );

        await client.query(
          `INSERT INTO stock_movements
             (product_id, to_warehouse_id, from_warehouse_id, movement_type, quantity,
              reference_type, reference_id, notes, created_at)
           VALUES ($1, $2, NULL, 'return', $3, $4, $5, $6, NOW())`,
          [
            c.product_id,
            c.from_warehouse_id,
            restoreQty,
            refType,
            refId,
            `إعادة مخزون خامات — تصحيح تكرار إنتاج id:${mv.id}`,
          ]
        );
      }

      // 4) Log to activity_logs
      await client.query(
        `INSERT INTO activity_logs (user_id, module, action_ar, details)
         VALUES (1, 'recipes', $1, $2)`,
        [
          `تصحيح تكرار عملية إنتاج — منتج ${productId}`,
          JSON.stringify({
            fix: 'duplicate_production_reversal',
            duplicate_movement_id: mv.id,
            original_movement_id: cas.originalMovementId,
            product_id: productId,
            warehouse_id: toWarehouse,
            reversed_qty: reverseQty,
            restored_ingredients: consRes.rows.map(c => ({
              product_id: c.product_id,
              warehouse_id: c.from_warehouse_id,
              qty: c.quantity,
            })),
          }),
        ]
      );

      console.log(`  ✓ Applied reversal for movement id=${mv.id}`);
      console.log('');
    }

    if (APPLY) {
      await client.query('COMMIT');
      console.log('=== All corrections committed successfully ===');

      // Show final inventory state
      const finalRes = await client.query(
        `SELECT product_id, warehouse_id, quantity
         FROM inventory
         WHERE product_id IN (74, 103, 121)
         ORDER BY product_id, warehouse_id`
      );
      console.log('\nFinal inventory for affected products:');
      finalRes.rows.forEach(r => {
        console.log(`  product_id=${r.product_id}, warehouse=${r.warehouse_id}, qty=${r.quantity}`);
      });

      const ingRes = await client.query(
        `SELECT product_id, warehouse_id, quantity
         FROM inventory
         WHERE product_id IN (23, 26, 28, 31, 32, 36, 38, 121)
         ORDER BY product_id, warehouse_id`
      );
      console.log('\nFinal inventory for affected ingredients:');
      ingRes.rows.forEach(r => {
        console.log(`  product_id=${r.product_id}, warehouse=${r.warehouse_id}, qty=${r.quantity}`);
      });
    } else {
      await client.query('ROLLBACK');
      console.log('=== Dry-run complete. No changes made. ===');
      console.log('Run with --apply to apply corrections.');
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('FAILED — rolled back:', err.message || err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
