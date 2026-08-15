import { getClient, query } from '../database/pool.ts';
import { AppError } from '../types/errors.ts';
import { invalidateDashboardCache } from './dashboardService.ts';
import { toNumber, sanitizeLimit } from '../utils/money.ts';
/**
 * قفل صف المخزون داخل معاملة (SELECT FOR UPDATE) لمنع التزامن.
 * @param {import('pg').PoolClient} client عميل المعاملة
 * @param {number} productId معرف المنتج
 * @param {number} warehouseId معرف المخزن
 */
const lockInventoryRow = async (
  client: import('pg').PoolClient,
  productId: number,
  warehouseId: number,
) => {
  const res = await client.query(
    `SELECT * FROM inventory WHERE product_id = $1 AND warehouse_id = $2 FOR UPDATE`,
    [productId, warehouseId],
  );
  if (res.rows[0]) return res.rows[0];
  await client.query(
    `INSERT INTO inventory (product_id, warehouse_id, quantity)
     VALUES ($1,$2,0)
     ON CONFLICT (product_id, warehouse_id, COALESCE(batch_number, '')) DO NOTHING`,
    [productId, warehouseId],
  );
  const res2 = await client.query(
    `SELECT * FROM inventory WHERE product_id = $1 AND warehouse_id = $2 FOR UPDATE`,
    [productId, warehouseId],
  );
  return res2.rows[0];
};
/**
 * ضمان وجود صف مخزون للمنتج/المخزن — يُنشأ عند غيابه.
 * @param {import('pg').PoolClient} client عميل المعاملة
 * @param {number} productId معرف المنتج
 * @param {number} warehouseId معرف المخزن
 */
const ensureInventoryRow = async (
  client: import('pg').PoolClient,
  productId: number,
  warehouseId: number,
) => {
  await client.query(
    `INSERT INTO inventory (product_id, warehouse_id, quantity)
     VALUES ($1,$2,0)
     ON CONFLICT (product_id, warehouse_id, COALESCE(batch_number, '')) DO NOTHING`,
    [productId, warehouseId],
  );
};
const assertNotRecipeProduct = async (client, productId) => {
  const recipe = await client.query(
    `SELECT 1
     FROM product_recipes
     WHERE product_id = $1
       AND deleted_at IS NULL
       AND is_active = TRUE
     LIMIT 1`,
    [productId],
  );
  if (recipe.rows[0]) {
    throw new AppError(
      '\u0644\u0627 \u064A\u0645\u0643\u0646 \u062A\u0639\u062F\u064A\u0644 \u0645\u062E\u0632\u0648\u0646 \u0645\u0646\u062A\u062C \u0645\u0631\u062A\u0628\u0637 \u0628\u0648\u0635\u0641\u0629 \u0646\u0634\u0637\u0629',
      400,
    );
  }
};
const ADJUSTMENT_MOVEMENT_TYPES = /* @__PURE__ */ new Set(['adjustment']);
const ensureStockTarget = async (client, productId, warehouseId) => {
  const product = await client.query(
    `SELECT id
     FROM products
     WHERE id = $1 AND deleted_at IS NULL AND is_active = TRUE`,
    [productId],
  );
  if (!product.rows[0])
    throw new AppError(
      '\u0627\u0644\u0645\u0646\u062A\u062C \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F',
      404,
    );
  const warehouse = await client.query(
    `SELECT id
     FROM warehouses
     WHERE id = $1 AND deleted_at IS NULL AND is_active = TRUE`,
    [warehouseId],
  );
  if (!warehouse.rows[0])
    throw new AppError(
      '\u0627\u0644\u0645\u062E\u0632\u0646 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F',
      404,
    );
};
import { inventoryRepository } from '../repositories/inventory.repository.ts';
/**
 * جلب المخزون الحالي (اختياري حسب المخزن).
 * @param {number} [warehouseId] معرف المخزن (اختياري)
 * @returns {Promise<any[]>}
 */
const getInventory = async (warehouseId?: number) => {
  return await inventoryRepository.getInventoryList(warehouseId);
};
/**
 * حركات المخزون مع فلترة (product_id, movement_type, limit...).
 * @param {Record<string, any>} [filters] خيارات الفلترة
 * @returns {Promise<any[]>}
 */
const getStockMovements = async (filters: Record<string, any> = {}) => {
  return await inventoryRepository.getStockMovements(filters);
};
/**
 * نقل كمية بين مخزنين (مع قفل الصفوف وتحديث التكلفة).
 * @param {Record<string, any>} data بيانات النقل (from_warehouse_id, to_warehouse_id, items...)
 * @param {number} userId معرف المستخدم المنفّذ
 * @returns {Promise<any>}
 */
const transferStock = async (data: Record<string, any>, userId: number) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const from_warehouse_id = Number(data.from_warehouse_id);
    const to_warehouse_id = Number(data.to_warehouse_id);

    if (!from_warehouse_id || !to_warehouse_id) {
      throw new AppError('المخزن المصدر والوجهة مطلوبان', 400);
    }

    const itemsToProcess =
      Array.isArray(data.items) && data.items.length > 0
        ? data.items
        : [
            {
              product_id: data.product_id,
              to_product_id: data.to_product_id,
              quantity: data.quantity,
              notes: data.notes,
            },
          ];

    if (!itemsToProcess.length) {
      throw new AppError('يرجى تحديد منتج واحد على الأقل للتحويل', 400);
    }

    const now = new Date();
    const year = now.getFullYear();
    const randDigits = Math.floor(1000 + Math.random() * 9000);
    const transferNumber = `TRF-${year}-${Date.now().toString().slice(-4)}${randDigits}`;

    const processedItems: any[] = [];

    for (const item of itemsToProcess) {
      const productId = Number(item.product_id);
      const toProductId = item.to_product_id ? Number(item.to_product_id) : productId;
      const quantity = toNumber(item.quantity);
      const itemNotes = item.notes || data.notes || '';

      if (!productId || isNaN(quantity) || quantity <= 0) {
        throw new AppError('المنتج والكمية يجب أن يكونا صحيحين وأكبر من صفر', 400);
      }
      if (from_warehouse_id === to_warehouse_id && toProductId === productId) {
        throw new AppError('لا يمكن التحويل إلى نفس المنتج والمخزن', 400);
      }

      await assertNotRecipeProduct(client, productId);
      if (toProductId !== productId) {
        await assertNotRecipeProduct(client, toProductId);
      }

      const fromRow = await lockInventoryRow(client, productId, from_warehouse_id);
      if (parseFloat(fromRow.quantity || 0) < quantity) {
        const prodNameRes = await client.query(`SELECT name_ar FROM products WHERE id = $1`, [
          productId,
        ]);
        const prodName = prodNameRes.rows[0]?.name_ar || `منتج رقم ${productId}`;
        throw new AppError(`الكمية الحالية غير كافية للمنتج: ${prodName}`, 400);
      }

      await client.query(
        `UPDATE inventory SET quantity = quantity - $1 WHERE product_id = $2 AND warehouse_id = $3`,
        [quantity, productId, from_warehouse_id],
      );
      await client.query(
        `INSERT INTO inventory (product_id, warehouse_id, quantity) VALUES ($1,$2,$3)
         ON CONFLICT (product_id, warehouse_id, COALESCE(batch_number, ''))
         DO UPDATE SET quantity = inventory.quantity + $3, updated_at = NOW()`,
        [toProductId, to_warehouse_id, quantity],
      );

      const voucherNote = `إذن تحويل رقم ${transferNumber}.${itemNotes ? ' ' + itemNotes : ''}`;

      if (toProductId !== productId) {
        let sourceName = 'منتج المصدر';
        let destName = 'منتج الوجهة';
        const pNames = await client.query(`SELECT id, name_ar FROM products WHERE id IN ($1, $2)`, [
          productId,
          toProductId,
        ]);
        pNames.rows.forEach((row) => {
          if (row.id === productId) sourceName = row.name_ar;
          if (row.id === toProductId) destName = row.name_ar;
        });

        await client.query(
          `INSERT INTO stock_movements (product_id, from_warehouse_id, to_warehouse_id, movement_type, quantity, user_id, reference_type, notes)
           VALUES ($1,$2,$3,'transfer',$4,$5,'transfer_voucher',$6)`,
          [
            productId,
            from_warehouse_id,
            to_warehouse_id,
            quantity,
            userId,
            `${voucherNote} (تحويل إلى: ${destName})`.trim(),
          ],
        );
        await client.query(
          `INSERT INTO stock_movements (product_id, from_warehouse_id, to_warehouse_id, movement_type, quantity, user_id, notes)
           VALUES ($1,$2,$3,'transfer',$4,$5,'transfer_voucher',$6)`,
          [
            toProductId,
            from_warehouse_id,
            to_warehouse_id,
            quantity,
            userId,
            `${voucherNote} (تحويل من: ${sourceName})`.trim(),
          ],
        );
      } else {
        await client.query(
          `INSERT INTO stock_movements (product_id, from_warehouse_id, to_warehouse_id, movement_type, quantity, user_id, reference_type, notes)
           VALUES ($1,$2,$3,'transfer',$4,$5,'transfer_voucher',$6)`,
          [productId, from_warehouse_id, to_warehouse_id, quantity, userId, voucherNote],
        );
      }

      processedItems.push({
        product_id: productId,
        to_product_id: toProductId,
        quantity,
      });
    }

    await client.query('COMMIT');
    invalidateDashboardCache();
    return {
      success: true,
      transfer_number: transferNumber,
      from_warehouse_id,
      to_warehouse_id,
      items_count: processedItems.length,
      created_at: now.toISOString(),
    };
  } catch (err: any) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};
/**
 * تعديل كمية مخزون (جرد/تسوية) مع تسجيل الحركة.
 * @param {Record<string, any>} data بيانات التعديل (product_id, warehouse_id, quantity...)
 * @param {number} userId معرف المستخدم المنفّذ
 * @returns {Promise<any>}
 */
const adjustStock = async (data: Record<string, any>, userId: number) => {
  const {
    product_id,
    warehouse_id,
    quantity,
    notes,
    movement_type = 'adjustment',
    min_stock,
  } = data;
  const targetQty = toNumber(quantity, NaN);
  const nextMinStock = min_stock === void 0 ? void 0 : toNumber(min_stock, NaN);
  if (!product_id || !warehouse_id)
    throw new AppError(
      '\u0627\u0644\u0645\u0646\u062A\u062C \u0648\u0627\u0644\u0645\u062E\u0632\u0646 \u0645\u0637\u0644\u0648\u0628\u0627\u0646',
      400,
    );
  if (!Number.isFinite(targetQty) || targetQty < 0)
    throw new AppError(
      '\u0627\u0644\u0643\u0645\u064A\u0629 \u064A\u062C\u0628 \u0623\u0646 \u062A\u0643\u0648\u0646 \u0635\u0641\u0631 \u0623\u0648 \u0623\u0643\u0628\u0631',
      400,
    );
  if (nextMinStock !== void 0 && (!Number.isFinite(nextMinStock) || nextMinStock < 0)) {
    throw new AppError(
      '\u062D\u062F \u0627\u0644\u0645\u062E\u0632\u0648\u0646 \u064A\u062C\u0628 \u0623\u0646 \u064A\u0643\u0648\u0646 \u0635\u0641\u0631 \u0623\u0648 \u0623\u0643\u0628\u0631',
      400,
    );
  }
  if (!ADJUSTMENT_MOVEMENT_TYPES.has(movement_type)) {
    throw new AppError(
      '\u0646\u0648\u0639 \u0627\u0644\u062D\u0631\u0643\u0629 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D',
      400,
    );
  }
  const client = await getClient();
  try {
    await client.query('BEGIN');
    await ensureStockTarget(client, product_id, warehouse_id);
    await assertNotRecipeProduct(client, product_id);
    const currentRow = await lockInventoryRow(client, product_id, warehouse_id);
    const currentQty = parseFloat(currentRow.quantity || 0);
    const delta = targetQty - currentQty;
    await client.query(
      "INSERT INTO inventory (product_id, warehouse_id, quantity) VALUES ($1,$2,$3) ON CONFLICT (product_id, warehouse_id, COALESCE(batch_number, '')) DO UPDATE SET quantity = $3, updated_at = NOW()",
      [product_id, warehouse_id, targetQty],
    );
    if (nextMinStock !== void 0) {
      await client.query(
        'UPDATE products SET min_stock = $1, updated_at = NOW() WHERE id = $2 AND deleted_at IS NULL',
        [nextMinStock, product_id],
      );
    }
    if (Math.abs(delta) > 1e-4) {
      const movementQuantity = Math.abs(delta);
      const fromWarehouseId = delta < 0 ? warehouse_id : null;
      const toWarehouseId = delta > 0 ? warehouse_id : null;
      await client.query(
        'INSERT INTO stock_movements (product_id, from_warehouse_id, to_warehouse_id, movement_type, quantity, user_id, notes) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [
          product_id,
          fromWarehouseId,
          toWarehouseId,
          movement_type,
          movementQuantity,
          userId,
          notes ||
            '\u062A\u0639\u062F\u064A\u0644 \u064A\u062F\u0648\u064A: ' +
              (delta >= 0 ? '+' : '') +
              delta.toFixed(3),
        ],
      );
    }
    await client.query('COMMIT');
  } catch (err: any) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};
/**
 * جلب قائمة المخازن.
 * @returns {Promise<any[]>}
 */
const getWarehouses = async () =>
  (await query(`SELECT * FROM warehouses WHERE deleted_at IS NULL ORDER BY id`)).rows;
/**
 * إرجاع منتج إلى المخزون وتسجيل حركة الإرجاع.
 * @param {Record<string, any>} data بيانات الإرجاع (product_id, warehouse_id, quantity...)
 * @param {number} userId معرف المستخدم المنفّذ
 * @returns {Promise<any>}
 */
const returnProductToStock = async (data: Record<string, any>, userId: number) => {
  const { product_id, warehouse_id, quantity, notes, sale_id } = data;
  const qty = parseFloat(quantity);
  if (!qty || qty <= 0)
    throw new AppError(
      '\u0627\u0644\u0643\u0645\u064A\u0629 \u064A\u062C\u0628 \u0623\u0646 \u062A\u0643\u0648\u0646 \u0623\u0643\u0628\u0631 \u0645\u0646 \u0635\u0641\u0631',
    );
  const product = await query(
    `SELECT id, name_ar, sku FROM products WHERE id = $1 AND deleted_at IS NULL`,
    [product_id],
  );
  if (!product.rows[0])
    throw new AppError(
      '\u0627\u0644\u0645\u0646\u062A\u062C \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F',
      404,
    );
  const warehouse = await query(
    `SELECT id, name_ar FROM warehouses WHERE id = $1 AND deleted_at IS NULL`,
    [warehouse_id],
  );
  if (!warehouse.rows[0])
    throw new AppError(
      '\u0627\u0644\u0645\u062E\u0632\u0646 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F',
      404,
    );
  const client = await getClient();
  try {
    await client.query('BEGIN');
    await assertNotRecipeProduct(client, product_id);
    await client.query(
      `INSERT INTO inventory (product_id, warehouse_id, quantity) VALUES ($1,$2,$3)
       ON CONFLICT (product_id, warehouse_id, COALESCE(batch_number, ''))
       DO UPDATE SET quantity = inventory.quantity + $3, updated_at = NOW()`,
      [product_id, warehouse_id, qty],
    );
    const refType = sale_id ? 'sale' : 'product_return';
    const refId = sale_id || product_id;
    await client.query(
      `INSERT INTO stock_movements (product_id, to_warehouse_id, movement_type, quantity, reference_type, reference_id, user_id, notes)
       VALUES ($1,$2,'return',$3,$4,$5,$6,$7)`,
      [
        product_id,
        warehouse_id,
        qty,
        refType,
        refId,
        userId,
        notes ||
          '\u0627\u0633\u062A\u0631\u062F\u0627\u062F \u0645\u0646\u062A\u062C \u0644\u0644\u0645\u062E\u0632\u0646',
      ],
    );
    const stock = await client.query(
      `SELECT quantity FROM inventory WHERE product_id = $1 AND warehouse_id = $2`,
      [product_id, warehouse_id],
    );
    await client.query(
      `INSERT INTO activity_logs (user_id, module, action_ar, details) VALUES ($1,'products',$2,$3)`,
      [
        userId,
        `\u0627\u0633\u062A\u0631\u062F\u0627\u062F \u0645\u0646\u062A\u062C: ${product.rows[0].name_ar} (+${qty})`,
        JSON.stringify({
          product_id,
          warehouse_id,
          quantity: qty,
          new_stock: stock.rows[0]?.quantity,
        }),
      ],
    );
    await client.query('COMMIT');
    return {
      product_id,
      product_name: product.rows[0].name_ar,
      warehouse_name: warehouse.rows[0].name_ar,
      quantity: qty,
      new_quantity: parseFloat(stock.rows[0]?.quantity || 0),
    };
  } catch (err: any) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};
/**
 * سجل مرتجعات المنتجات مع فلترة (product_id, limit...).
 * @param {Record<string, any>} [filters] خيارات الفلترة
 * @returns {Promise<any[]>}
 */
const getProductReturns = async (filters: Record<string, any> = {}) => {
  let sql = `SELECT sm.*, p.name_ar as product_name, p.sku, w.name_ar as warehouse_name, u.full_name as user_name
    FROM stock_movements sm
    JOIN products p ON sm.product_id = p.id
    LEFT JOIN warehouses w ON sm.to_warehouse_id = w.id
    LEFT JOIN users u ON sm.user_id = u.id
    WHERE sm.movement_type = 'return'
      AND sm.reference_type = 'product_return'`;
  const params: any[] = [];
  let i = 1;
  if (filters.product_id) {
    sql += ` AND sm.product_id = $${i++}`;
    params.push(filters.product_id);
  }
  sql += ` ORDER BY sm.created_at DESC LIMIT ${sanitizeLimit(filters.limit, 50)}`;
  return (await query(sql, params)).rows;
};
/**
 * مسح كل بيانات المخزون (إعادة ضبط) — للمدير فقط.
 * @param {number} userId معرف المستخدم المنفّذ
 * @returns {Promise<any>}
 */
const clearAllInventoryData = async (userId: number) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const inventoryCountRes = await client.query(`SELECT COUNT(*)::int AS count FROM inventory`);
    const movementCountRes = await client.query(
      `SELECT COUNT(*)::int AS count FROM stock_movements`,
    );
    await client.query(`DELETE FROM stock_movements`);
    await client.query(`DELETE FROM inventory`);
    await client.query(
      `INSERT INTO activity_logs (user_id, module, action_ar, details)
       VALUES ($1, 'inventory', $2, $3)`,
      [
        userId,
        '\u062D\u0630\u0641 \u0627\u0644\u0645\u062E\u0632\u0648\u0646 \u0628\u0627\u0644\u0643\u0627\u0645\u0644',
        JSON.stringify({
          inventory_rows_deleted: inventoryCountRes.rows[0]?.count || 0,
          stock_movements_deleted: movementCountRes.rows[0]?.count || 0,
        }),
      ],
    );
    await client.query('COMMIT');
    return {
      inventory_rows_deleted: inventoryCountRes.rows[0]?.count || 0,
      stock_movements_deleted: movementCountRes.rows[0]?.count || 0,
    };
  } catch (err: any) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};
export {
  adjustStock,
  clearAllInventoryData,
  ensureInventoryRow,
  getInventory,
  getProductReturns,
  getStockMovements,
  getWarehouses,
  lockInventoryRow,
  returnProductToStock,
  transferStock,
};
