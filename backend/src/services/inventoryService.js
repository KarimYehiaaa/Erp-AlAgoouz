import { getClient, query } from '../database/pool.js';
import { AppError } from '../middleware/errorHandler.js';
import { invalidateDashboardCache } from './dashboardService.js';

/**
 * Helpers to ensure / lock inventory rows inside a transaction.
 */
export const lockInventoryRow = async (client, productId, warehouseId) => {
  const res = await client.query(
    `SELECT * FROM inventory WHERE product_id = $1 AND warehouse_id = $2 FOR UPDATE`,
    [productId, warehouseId]
  );
  if (res.rows[0]) return res.rows[0];

  await client.query(
    `INSERT INTO inventory (product_id, warehouse_id, quantity)
     VALUES ($1,$2,0)
     ON CONFLICT (product_id, warehouse_id, COALESCE(batch_number, '')) DO NOTHING`,
    [productId, warehouseId]
  );

  const res2 = await client.query(
    `SELECT * FROM inventory WHERE product_id = $1 AND warehouse_id = $2 FOR UPDATE`,
    [productId, warehouseId]
  );
  return res2.rows[0];
};

export const ensureInventoryRow = async (client, productId, warehouseId) => {
  await client.query(
    `INSERT INTO inventory (product_id, warehouse_id, quantity)
     VALUES ($1,$2,0)
     ON CONFLICT (product_id, warehouse_id, COALESCE(batch_number, '')) DO NOTHING`,
    [productId, warehouseId]
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
    [productId]
  );
  if (recipe.rows[0]) {
    throw new AppError('لا يمكن تعديل مخزون منتج مرتبط بوصفة نشطة', 400);
  }
};

const toNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const sanitizeLimit = (value, fallback = 100, max = 500) => {
  const n = Math.floor(toNumber(value, fallback));
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, max);
};

const ADJUSTMENT_MOVEMENT_TYPES = new Set(['adjustment']);

const ensureStockTarget = async (client, productId, warehouseId) => {
  const product = await client.query(
    `SELECT id
     FROM products
     WHERE id = $1 AND deleted_at IS NULL AND is_active = TRUE`,
    [productId]
  );
  if (!product.rows[0]) throw new AppError('المنتج غير موجود', 404);

  const warehouse = await client.query(
    `SELECT id
     FROM warehouses
     WHERE id = $1 AND deleted_at IS NULL AND is_active = TRUE`,
    [warehouseId]
  );
  if (!warehouse.rows[0]) throw new AppError('المخزن غير موجود', 404);
};

export const getInventory = async (warehouseId) => {
  const params = [];
  let sql = `
    SELECT
      COALESCE(i.id, 0) AS id,
      p.id AS product_id,
      w.id AS warehouse_id,
      COALESCE(i.quantity, 0) AS quantity,
      i.batch_number,
      i.updated_at,
      p.sku,
      p.name_ar,
      p.min_stock,
      p.sale_price,
      EXISTS (
        SELECT 1
        FROM product_recipes r
        WHERE r.product_id = p.id
          AND r.deleted_at IS NULL
          AND r.is_active = TRUE
      ) AS has_active_recipe,
      w.name_ar AS warehouse_name,
      CASE WHEN COALESCE(i.quantity, 0) <= p.min_stock THEN TRUE ELSE FALSE END AS is_low
    FROM products p
    JOIN warehouses w
      ON w.deleted_at IS NULL
      AND w.is_active = TRUE
      AND (
        p.primary_warehouse_id = w.id
        OR (
          p.primary_warehouse_id IS NULL
          AND EXISTS (
            SELECT 1
            FROM inventory ix
            WHERE ix.product_id = p.id
              AND ix.warehouse_id = w.id
          )
        )
      )
    LEFT JOIN inventory i
      ON i.product_id = p.id
      AND i.warehouse_id = w.id
    WHERE p.deleted_at IS NULL
      AND p.is_active = TRUE
  `;

  if (warehouseId) {
    sql += ` AND w.id = $1`;
    params.push(warehouseId);
  }

  sql += ` ORDER BY p.name_ar, w.id, COALESCE(i.batch_number, '')`;
  return (await query(sql, params)).rows;
};

export const getStockMovements = async (filters = {}) => {
  let sql = `SELECT sm.*, p.name_ar as product_name, u.full_name as user_name,
    fw.name_ar as from_warehouse, tw.name_ar as to_warehouse
    FROM stock_movements sm
    JOIN products p ON sm.product_id = p.id
    LEFT JOIN users u ON sm.user_id = u.id
    LEFT JOIN warehouses fw ON sm.from_warehouse_id = fw.id
    LEFT JOIN warehouses tw ON sm.to_warehouse_id = tw.id WHERE 1=1`;
  const params = [];
  let i = 1;
  if (filters.product_id) { sql += ` AND sm.product_id = $${i++}`; params.push(filters.product_id); }
  if (filters.warehouse_id) { sql += ` AND (sm.from_warehouse_id = $${i} OR sm.to_warehouse_id = $${i})`; params.push(filters.warehouse_id); i++; }
  sql += ` ORDER BY sm.created_at DESC LIMIT ${sanitizeLimit(filters.limit)}`;
  return (await query(sql, params)).rows;
};

export const transferStock = async (data, userId) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { product_id, from_warehouse_id, to_warehouse_id, notes } = data;
    const to_product_id = data.to_product_id ? Number(data.to_product_id) : Number(product_id);
    const quantity = toNumber(data.quantity);
    
    if (!product_id || !from_warehouse_id || !to_warehouse_id) {
      throw new AppError('جميع الحقول مطلوبة');
    }
    if (quantity <= 0) {
      throw new AppError('الكمية يجب أن تكون أكبر من صفر');
    }
    if (Number(from_warehouse_id) === Number(to_warehouse_id) && to_product_id === Number(product_id)) {
      throw new AppError('لا يمكن التحويل إلى نفس المنتج والمخزن');
    }

    await assertNotRecipeProduct(client, product_id);
    if (to_product_id !== Number(product_id)) {
      await assertNotRecipeProduct(client, to_product_id);
    }

    const fromRow = await lockInventoryRow(client, product_id, from_warehouse_id);
    if (parseFloat(fromRow.quantity || 0) < quantity) {
      throw new AppError('الكمية الحالية في المخزن غير كافية');
    }

    await client.query(
      `UPDATE inventory SET quantity = quantity - $1 WHERE product_id = $2 AND warehouse_id = $3`,
      [quantity, product_id, from_warehouse_id]
    );

    await client.query(
      `INSERT INTO inventory (product_id, warehouse_id, quantity) VALUES ($1,$2,$3)
       ON CONFLICT (product_id, warehouse_id, COALESCE(batch_number, ''))
       DO UPDATE SET quantity = inventory.quantity + $3, updated_at = NOW()`,
      [to_product_id, to_warehouse_id, quantity]
    );

    if (to_product_id !== Number(product_id)) {
      let sourceName = 'منتج المصدر';
      let destName = 'منتج الوجهة';
      const pNames = await client.query(
        `SELECT id, name_ar FROM products WHERE id IN ($1, $2)`,
        [product_id, to_product_id]
      );
      pNames.rows.forEach(row => {
        if (row.id === Number(product_id)) sourceName = row.name_ar;
        if (row.id === to_product_id) destName = row.name_ar;
      });

      await client.query(
        `INSERT INTO stock_movements (product_id, from_warehouse_id, to_warehouse_id, movement_type, quantity, user_id, notes)
         VALUES ($1,$2,$3,'transfer',$4,$5,$6)`,
        [product_id, from_warehouse_id, to_warehouse_id, quantity, userId, `تحويل إلى منتج آخر: ${destName}. ${notes || ''}`.trim()]
      );

      await client.query(
        `INSERT INTO stock_movements (product_id, from_warehouse_id, to_warehouse_id, movement_type, quantity, user_id, notes)
         VALUES ($1,$2,$3,'transfer',$4,$5,$6)`,
        [to_product_id, from_warehouse_id, to_warehouse_id, quantity, userId, `تحويل من منتج آخر: ${sourceName}. ${notes || ''}`.trim()]
      );
    } else {
      await client.query(
        `INSERT INTO stock_movements (product_id, from_warehouse_id, to_warehouse_id, movement_type, quantity, user_id, notes)
         VALUES ($1,$2,$3,'transfer',$4,$5,$6)`,
        [product_id, from_warehouse_id, to_warehouse_id, quantity, userId, notes]
      );
    }

    await client.query('COMMIT');
    invalidateDashboardCache();
    return { success: true };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export const adjustStock = async (data, userId) => {
  const { product_id, warehouse_id, quantity, notes, movement_type = 'adjustment', min_stock } = data;
  const targetQty = toNumber(quantity, NaN);
  const nextMinStock = min_stock === undefined ? undefined : toNumber(min_stock, NaN);
  if (!product_id || !warehouse_id) throw new AppError('المنتج والمخزن مطلوبان', 400);
  if (!Number.isFinite(targetQty) || targetQty < 0) throw new AppError('الكمية يجب أن تكون صفر أو أكبر', 400);
  if (nextMinStock !== undefined && (!Number.isFinite(nextMinStock) || nextMinStock < 0)) {
    throw new AppError('حد المخزون يجب أن يكون صفر أو أكبر', 400);
  }
  if (!ADJUSTMENT_MOVEMENT_TYPES.has(movement_type)) {
    throw new AppError('نوع الحركة غير صحيح', 400);
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
      'INSERT INTO inventory (product_id, warehouse_id, quantity) VALUES ($1,$2,$3) ON CONFLICT (product_id, warehouse_id, COALESCE(batch_number, \'\')) DO UPDATE SET quantity = $3, updated_at = NOW()',
      [product_id, warehouse_id, targetQty]
    );

    if (nextMinStock !== undefined) {
      await client.query(
        'UPDATE products SET min_stock = $1, updated_at = NOW() WHERE id = $2 AND deleted_at IS NULL',
        [nextMinStock, product_id]
      );
    }

    if (Math.abs(delta) > 0.0001) {
      const movementQuantity = Math.abs(delta);
      const fromWarehouseId = delta < 0 ? warehouse_id : null;
      const toWarehouseId = delta > 0 ? warehouse_id : null;
      await client.query(
        'INSERT INTO stock_movements (product_id, from_warehouse_id, to_warehouse_id, movement_type, quantity, user_id, notes) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [product_id, fromWarehouseId, toWarehouseId, movement_type, movementQuantity, userId, notes || ('تعديل يدوي: ' + (delta >= 0 ? '+' : '') + delta.toFixed(3))]
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export const getWarehouses = async () =>
  (await query(`SELECT * FROM warehouses WHERE deleted_at IS NULL ORDER BY id`)).rows;

export const returnProductToStock = async (data, userId) => {
  const { product_id, warehouse_id, quantity, notes, sale_id } = data;
  const qty = parseFloat(quantity);
  if (!qty || qty <= 0) throw new AppError('الكمية يجب أن تكون أكبر من صفر');

  const product = await query(`SELECT id, name_ar, sku FROM products WHERE id = $1 AND deleted_at IS NULL`, [product_id]);
  if (!product.rows[0]) throw new AppError('المنتج غير موجود', 404);

  const warehouse = await query(`SELECT id, name_ar FROM warehouses WHERE id = $1 AND deleted_at IS NULL`, [warehouse_id]);
  if (!warehouse.rows[0]) throw new AppError('المخزن غير موجود', 404);

  const client = await getClient();
  try {
    await client.query('BEGIN');
    await assertNotRecipeProduct(client, product_id);

    await client.query(
      `INSERT INTO inventory (product_id, warehouse_id, quantity) VALUES ($1,$2,$3)
       ON CONFLICT (product_id, warehouse_id, COALESCE(batch_number, ''))
       DO UPDATE SET quantity = inventory.quantity + $3, updated_at = NOW()`,
      [product_id, warehouse_id, qty]
    );

    const refType = sale_id ? 'sale' : 'product_return';
    const refId = sale_id || product_id;

    await client.query(
      `INSERT INTO stock_movements (product_id, to_warehouse_id, movement_type, quantity, reference_type, reference_id, user_id, notes)
       VALUES ($1,$2,'return',$3,$4,$5,$6,$7)`,
      [product_id, warehouse_id, qty, refType, refId, userId, notes || 'استرداد منتج للمخزن']
    );

    const stock = await client.query(
      `SELECT quantity FROM inventory WHERE product_id = $1 AND warehouse_id = $2`,
      [product_id, warehouse_id]
    );

    await client.query(
      `INSERT INTO activity_logs (user_id, module, action_ar, details) VALUES ($1,'products',$2,$3)`,
      [
        userId,
        `'3*1/'/ EF*,: ${product.rows[0].name_ar} (+${qty})`,
        JSON.stringify({ product_id, warehouse_id, quantity: qty, new_stock: stock.rows[0]?.quantity }),
      ]
    );

    await client.query('COMMIT');
    return {
      product_id,
      product_name: product.rows[0].name_ar,
      warehouse_name: warehouse.rows[0].name_ar,
      quantity: qty,
      new_quantity: parseFloat(stock.rows[0]?.quantity || 0),
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export const getProductReturns = async (filters = {}) => {
  let sql = `SELECT sm.*, p.name_ar as product_name, p.sku, w.name_ar as warehouse_name, u.full_name as user_name
    FROM stock_movements sm
    JOIN products p ON sm.product_id = p.id
    LEFT JOIN warehouses w ON sm.to_warehouse_id = w.id
    LEFT JOIN users u ON sm.user_id = u.id
    WHERE sm.movement_type = 'return'
      AND sm.reference_type = 'product_return'`;
  const params = [];
  let i = 1;
  if (filters.product_id) { sql += ` AND sm.product_id = $${i++}`; params.push(filters.product_id); }
  sql += ` ORDER BY sm.created_at DESC LIMIT ${sanitizeLimit(filters.limit, 50)}`;
  return (await query(sql, params)).rows;
};

export const clearAllInventoryData = async (userId) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const inventoryCountRes = await client.query(`SELECT COUNT(*)::int AS count FROM inventory`);
    const movementCountRes = await client.query(`SELECT COUNT(*)::int AS count FROM stock_movements`);

    await client.query(`TRUNCATE TABLE stock_movements RESTART IDENTITY CASCADE`);
    await client.query(`TRUNCATE TABLE inventory RESTART IDENTITY CASCADE`);

    await client.query(
      `INSERT INTO activity_logs (user_id, module, action_ar, details)
       VALUES ($1, 'inventory', $2, $3)`,
      [
        userId,
        'حذف المخزون بالكامل',
        JSON.stringify({
          inventory_rows_deleted: inventoryCountRes.rows[0]?.count || 0,
          stock_movements_deleted: movementCountRes.rows[0]?.count || 0,
        }),
      ]
    );

    await client.query('COMMIT');
    return {
      inventory_rows_deleted: inventoryCountRes.rows[0]?.count || 0,
      stock_movements_deleted: movementCountRes.rows[0]?.count || 0,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};
