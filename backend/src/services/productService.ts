import { getClient, query } from '../database/pool.ts';
import { AppError } from '../types/errors.ts';
import { getProductsEffectiveCosts } from './productCostService.ts';
import { getDefaultWarehouseId, getWarehouseIdByCode } from './warehouseService.ts';
import { ensureInventoryRow } from './inventoryService.ts';
import { sanitizeLimit, toNumber } from '../utils/money.ts';
import { appCache } from '../utils/cache.ts';
import { invalidateDashboardCache } from './dashboardService.ts';

/**
 * Ø¬Ù„Ø¨ Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„Ù…Ù†ØªØ¬Ø§Øª Ù…Ø¹ ÙÙ„ØªØ±Ø© ÙˆØ¨Ø­Ø« ÙˆØªØ±Ù‚ÙŠÙ….
 * @param {Record<string, any>} [filters] Ø®ÙŠØ§Ø±Ø§Øª Ø§Ù„ÙÙ„ØªØ±Ø© (search, category_id, warehouse_id, is_active...)
 * @returns {Promise<{ rows: any[], total: number }>}
 */
export const getProducts = async (filters: Record<string, any> = {}) => {
  let sql = `SELECT p.*, pc.name_ar as category_name,
    COALESCE(ar.has_active_recipe, FALSE) as has_active_recipe,
    COALESCE(inv.total_stock, 0) as total_stock,
    COALESCE(pw.name_ar, fallback_w.name_ar) as primary_warehouse_name,
    (
      SELECT json_agg(json_build_object('warehouse_id', i.warehouse_id, 'warehouse_name', w.name_ar, 'quantity', i.quantity))
      FROM inventory i JOIN warehouses w ON i.warehouse_id = w.id WHERE i.product_id = p.id
    ) as stock_details
    FROM products p
    LEFT JOIN product_categories pc ON p.category_id = pc.id
    LEFT JOIN warehouses pw ON pw.id = p.primary_warehouse_id
    LEFT JOIN LATERAL (
      SELECT TRUE as has_active_recipe
      FROM product_recipes r
      WHERE r.product_id = p.id
        AND r.deleted_at IS NULL
        AND r.is_active = TRUE
      LIMIT 1
    ) ar ON TRUE
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(i.quantity), 0) as total_stock
      FROM inventory i
      WHERE i.product_id = p.id
    ) inv ON TRUE
    LEFT JOIN LATERAL (
      SELECT w2.name_ar
      FROM inventory i
      JOIN warehouses w2 ON w2.id = i.warehouse_id
      WHERE i.product_id = p.id
      ORDER BY i.quantity DESC, i.id ASC
      LIMIT 1
    ) fallback_w ON p.primary_warehouse_id IS NULL
    WHERE p.deleted_at IS NULL`;
  const params: any[] = [];
  let i = 1;
  if (filters.category_id) {
    sql += ` AND p.category_id = $${i++}`;
    params.push(filters.category_id);
  }
  if (filters.search) {
    sql += ` AND (p.name_ar ILIKE $${i} OR p.sku ILIKE $${i} OR p.barcode ILIKE $${i})`;
    params.push(`%${filters.search}%`);
    i++;
  }
  if (filters.primary_warehouse_only) {
    sql += ` AND p.primary_warehouse_id IS NOT NULL`;
  }
  if (filters.primary_warehouse_id) {
    sql += ` AND p.primary_warehouse_id = $${i++}`;
    params.push(filters.primary_warehouse_id);
  }
  if (filters.warehouse_id) {
    sql += ` AND (
      p.primary_warehouse_id = $${i}
      OR (p.primary_warehouse_id IS NULL AND EXISTS (
        SELECT 1 FROM inventory i2 WHERE i2.product_id = p.id AND i2.warehouse_id = $${i}
      ))
    )`;
    params.push(Number(filters.warehouse_id));
    i++;
  }
  if (filters.is_active !== undefined) {
    sql += ` AND p.is_active = $${i++}`;
    params.push(filters.is_active);
  }
  sql += ` ORDER BY p.name_ar LIMIT $${i}`;
  params.push(sanitizeLimit(filters.limit));
  const rows = (await query(sql, params)).rows;

  const recipeProductIds = rows.filter((r) => r.has_active_recipe).map((r) => r.id);

  if (recipeProductIds.length > 0) {
    const costs = await getProductsEffectiveCosts({ query }, recipeProductIds);
    for (const r of rows) {
      if (r.has_active_recipe) {
        const effective = costs.get(Number(r.id));
        if (effective && effective.cost > 0) {
          r.purchase_price = effective.cost;
        }
      }
    }
  }

  return rows;
};

/**
 * Ø¬Ù„Ø¨ Ù…Ù†ØªØ¬ ÙˆØ§Ø­Ø¯ ÙƒØ§Ù…Ù„Ø§Ù‹ Ù…Ø¹ Ø§Ù„ÙˆØµÙØ© ÙˆØ§Ù„Ù…Ø®Ø²ÙˆÙ†.
 * @param {number} id Ù…Ø¹Ø±Ù Ø§Ù„Ù…Ù†ØªØ¬
 * @returns {Promise<any>}
 */
export const getProductById = async (id: number) => {
  const result = await query(
    `SELECT p.*, pc.name_ar as category_name,
      EXISTS (
        SELECT 1
        FROM product_recipes r
        WHERE r.product_id = p.id
          AND r.deleted_at IS NULL
          AND r.is_active = TRUE
      ) AS has_active_recipe,
      (
        SELECT json_agg(json_build_object('warehouse_id', i.warehouse_id, 'warehouse_name', w.name_ar, 'quantity', i.quantity))
        FROM inventory i JOIN warehouses w ON i.warehouse_id = w.id WHERE i.product_id = p.id
      ) as stock
     FROM products p LEFT JOIN product_categories pc ON p.category_id = pc.id
     WHERE p.id = $1 AND p.deleted_at IS NULL`,
    [id],
  );
  if (!result.rows[0]) throw new AppError('Ø§Ù„Ù…Ù†ØªØ¬ ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯', 404);
  const product = result.rows[0];

  if (product.has_active_recipe) {
    const costs = await getProductsEffectiveCosts({ query }, [product.id]);
    const effective = costs.get(Number(product.id));
    if (effective && effective.cost > 0) {
      product.purchase_price = effective.cost;
    }
  }

  return product;
};

const PRODUCT_SKU_PREFIX = 'AGoouz-';

const generateProductSku = async (client) => {
  await client.query(`SELECT pg_advisory_xact_lock(hashtext('products:sku'))`);
  const result = await client.query(
    `SELECT COALESCE(MAX((substring(sku FROM '^AGoouz-([0-9]+)$'))::int), 0) + 1 AS next_number
     FROM products
     WHERE sku ~ '^AGoouz-[0-9]+$'`,
  );
  return `${PRODUCT_SKU_PREFIX}${String(result.rows[0].next_number).padStart(3, '0')}`;
};

/** ØªÙˆÙ„ÙŠØ¯ Ø±Ù‚Ù… SKU ØªÙ„Ù‚Ø§Ø¦ÙŠ Ù„Ù„Ù…Ù†ØªØ¬ Ø§Ù„ØªØ§Ù„ÙŠ. */
export const getNextProductSku = async () => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const sku = await generateProductSku(client);
    await client.query('ROLLBACK');
    return { sku };
  } catch (err: any) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Ø¥Ù†Ø´Ø§Ø¡ Ù…Ù†ØªØ¬ Ø¬Ø¯ÙŠØ¯ Ù…Ø¹ Ø§Ù„Ø£Ø±ØµØ¯Ø© Ø§Ù„Ø§ÙØªØªØ§Ø­ÙŠØ© ÙˆØ§Ù„Ù…Ø®Ø§Ø²Ù†.
 * @param {Record<string, any>} data Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ù…Ù†ØªØ¬
 * @returns {Promise<any>}
 */
export const createProduct = async (data: Record<string, any>) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const sku = String(data.sku || '').trim() || (await generateProductSku(client));
    const barcode = String(data.barcode || '').trim() || null;
    const result = await client.query(
      `INSERT INTO products (sku, barcode, name_ar, description, category_id, unit, purchase_price, sale_price, wholesale_price, min_stock, image_url, is_active, track_expiry, primary_warehouse_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [
        sku,
        barcode,
        data.name_ar,
        data.description,
        data.category_id,
        data.unit || 'count',
        data.purchase_price || 0,
        data.sale_price,
        data.wholesale_price,
        data.min_stock || 5,
        data.image_url,
        data.is_active ?? true,
        data.track_expiry ?? false,
        data.primary_warehouse_id || null,
      ],
    );
    if (data.warehouse_stocks && typeof data.warehouse_stocks === 'object') {
      for (const [wId, qty] of Object.entries(data.warehouse_stocks)) {
        const val = toNumber(qty);
        await client.query(
          `INSERT INTO inventory (product_id, warehouse_id, quantity) VALUES ($1,$2,$3)
           ON CONFLICT (product_id, warehouse_id, COALESCE(batch_number, ''))
           DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = NOW()`,
          [result.rows[0].id, wId, val],
        );
      }
    } else if (data.initial_stock) {
      for (const [warehouseId, qty] of Object.entries(data.initial_stock)) {
        await client.query(
          `INSERT INTO inventory (product_id, warehouse_id, quantity) VALUES ($1,$2,$3)
           ON CONFLICT (product_id, warehouse_id, COALESCE(batch_number, ''))
           DO UPDATE SET quantity = inventory.quantity + $3, updated_at = NOW()`,
          [result.rows[0].id, warehouseId, qty],
        );
      }
    }

    await client.query('COMMIT');
    appCache.invalidateByTag('product_cost');
    appCache.invalidateByTag('products');
    invalidateDashboardCache();
    return result.rows[0];
  } catch (err: any) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * ØªØ­Ø¯ÙŠØ« Ù…Ù†ØªØ¬ (Ø¨ÙŠØ§Ù†Ø§ØªØŒ Ù…Ø®Ø§Ø²Ù†ØŒ Ø£Ø±ØµØ¯Ø©).
 * @param {number} id Ù…Ø¹Ø±Ù Ø§Ù„Ù…Ù†ØªØ¬
 * @param {Record<string, any>} data Ø§Ù„Ø­Ù‚ÙˆÙ„ Ø§Ù„Ù…Ø·Ù„ÙˆØ¨ ØªØ­Ø¯ÙŠØ«Ù‡Ø§
 * @returns {Promise<any>}
 */
export const updateProduct = async (id: number, data: Record<string, any>) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const existingRes = await client.query(
      'SELECT p.id, p.primary_warehouse_id, EXISTS (SELECT 1 FROM product_recipes r WHERE r.product_id = p.id AND r.deleted_at IS NULL AND r.is_active = TRUE) AS has_active_recipe FROM products p WHERE p.id = $1 AND p.deleted_at IS NULL FOR UPDATE',
      [id],
    );
    const existing = existingRes.rows[0];
    if (!existing) throw new AppError('Ø§Ù„Ù…Ù†ØªØ¬ ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯', 404);

    const warehouseProvided = data.primary_warehouse_id !== undefined;
    const nextWarehouseId = warehouseProvided
      ? Number(data.primary_warehouse_id) || null
      : existing.primary_warehouse_id || null;
    const warehouseChanged =
      warehouseProvided &&
      Number(nextWarehouseId || 0) !== Number(existing.primary_warehouse_id || 0);

    if (warehouseChanged) {
      if (existing.has_active_recipe) {
        throw new AppError(
          'Ù„Ø§ ÙŠÙ…ÙƒÙ† ØªØºÙŠÙŠØ± Ù…Ø®Ø²Ù† Ù…Ù†ØªØ¬ Ù…Ø±ØªØ¨Ø· Ø¨ÙˆØµÙØ© Ù†Ø´Ø·Ø©',
          400,
        );
      }
      const warehouseRes = await client.query(
        'SELECT id FROM warehouses WHERE id = $1 AND deleted_at IS NULL AND is_active = TRUE',
        [nextWarehouseId],
      );
      if (!warehouseRes.rows[0]) throw new AppError('Ø§Ù„Ù…Ø®Ø²Ù† ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯', 404);
    }

    const fields = [
      'sku',
      'barcode',
      'name_ar',
      'description',
      'category_id',
      'unit',
      'purchase_price',
      'sale_price',
      'wholesale_price',
      'min_stock',
      'image_url',
      'is_active',
      'track_expiry',
    ];
    const sets: any[] = [];
    const values: any[] = [];
    let i = 1;
    for (const f of fields) {
      if (data[f] !== undefined) {
        sets.push(f + ' = $' + i++);
        values.push(data[f]);
      }
    }
    if (warehouseProvided && !warehouseChanged) {
      sets.push('primary_warehouse_id = $' + i++);
      values.push(nextWarehouseId);
    }
    if (sets.length) {
      sets.push('updated_at = NOW()');
      values.push(id);
      await client.query(
        'UPDATE products SET ' + sets.join(', ') + ' WHERE id = $' + i + ' AND deleted_at IS NULL',
        values,
      );
    }

    if (warehouseChanged) {
      await ensureInventoryRow(client, id, nextWarehouseId);
      await client.query(
        'UPDATE products SET primary_warehouse_id = $1, updated_at = NOW() WHERE id = $2',
        [nextWarehouseId, id],
      );
    }

    if (data.warehouse_stocks && typeof data.warehouse_stocks === 'object') {
      for (const [wId, qty] of Object.entries(data.warehouse_stocks)) {
        const val = toNumber(qty);
        await client.query(
          `INSERT INTO inventory (product_id, warehouse_id, quantity) VALUES ($1,$2,$3)
           ON CONFLICT (product_id, warehouse_id, COALESCE(batch_number, ''))
           DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = NOW()`,
          [id, wId, val],
        );
      }
    }

    await client.query('COMMIT');
    appCache.invalidateByTag('product_cost');
    appCache.invalidateByTag('products');
    invalidateDashboardCache();
    return getProductById(id);
  } catch (err: any) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/** حذف منتج (حذف ناعم). */
export const deleteProduct = async (id: number) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const productRes = await client.query(
      `UPDATE products
       SET deleted_at = NOW(), is_active = FALSE, updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id`,
      [id],
    );
    if (!productRes.rows[0]) throw new AppError('المنتج غير موجود', 404);

    await client.query(`DELETE FROM inventory WHERE product_id = $1`, [id]);

    await client.query(
      `UPDATE product_recipes
       SET deleted_at = NOW(), updated_at = NOW()
       WHERE deleted_at IS NULL
         AND (
           product_id = $1
           OR id IN (
             SELECT recipe_id FROM product_recipe_items WHERE ingredient_product_id = $1
           )
         )`,
      [id],
    );

    await client.query('COMMIT');
    appCache.invalidateByTag('product_cost');
    appCache.invalidateByTag('products');
    invalidateDashboardCache();
  } catch (err: any) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/** تعيين المخزن الرئيسي لمنتج. */
export const setProductWarehouse = async (id: number, warehouseId: number) => {
  const wid = Number(warehouseId);
  if (!wid) throw new AppError('معرف المخزن غير صالح', 400);
  const updated = await updateProduct(id, { primary_warehouse_id: wid });
  const totalQty = Array.isArray(updated?.stock)
    ? updated.stock.reduce((sum, row) => sum + Number(row.quantity || 0), 0)
    : 0;
  return { product_id: Number(id), warehouse_id: wid, quantity: totalQty };
};

/** مسح كل المنتجات (إعادة ضبط) — للمدير فقط. */
export const deleteAllProducts = async () => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `UPDATE products
       SET deleted_at = NOW(), is_active = FALSE, updated_at = NOW()
       WHERE deleted_at IS NULL
       RETURNING id`,
    );

    const deletedIds = result.rows.map((r) => r.id);
    if (deletedIds.length) {
      await client.query(`DELETE FROM inventory WHERE product_id = ANY($1::int[])`, [deletedIds]);
      await client.query(
        `UPDATE product_recipes
         SET deleted_at = NOW(), updated_at = NOW()
         WHERE deleted_at IS NULL
           AND (
             product_id = ANY($1::int[])
             OR id IN (
               SELECT recipe_id FROM product_recipe_items WHERE ingredient_product_id = ANY($1::int[])
             )
           )`,
        [deletedIds],
      );
    }

    await client.query('COMMIT');
    appCache.invalidateByTag('product_cost');
    appCache.invalidateByTag('products');
    invalidateDashboardCache();
    return { deletedCount: result.rowCount || 0 };
  } catch (err: any) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/** Ø¬Ù„Ø¨ Ø´Ø¬Ø±Ø© Ø§Ù„ØªØµÙ†ÙŠÙØ§Øª. */
export const getCategories = async () => {
  const result = await query(
    `SELECT pc.*, COALESCE(COUNT(p.id), 0) AS products_count
     FROM product_categories pc
     LEFT JOIN products p ON p.category_id = pc.id AND p.deleted_at IS NULL
     WHERE pc.deleted_at IS NULL
     GROUP BY pc.id
     ORDER BY pc.sort_order`,
  );
  return result.rows;
};

/**
 * *B1J1 'D*C'DJA: CD EF*,'* 'DE-D E9 391 'D41'!/'D(J9/'D1(- H'DE(J9'* 'DA9DJ)
 */
/**
 * ØªÙ‚Ø±ÙŠØ± ØªÙƒØ§Ù„ÙŠÙ Ø§Ù„Ù…Ù†ØªØ¬Ø§Øª.
 * @param {Record<string, any>} [filters] Ø®ÙŠØ§Ø±Ø§Øª Ø§Ù„ØªÙ‚Ø±ÙŠØ± (warehouse_id...)
 * @returns {Promise<any[]>}
 */
export const getCostsReport = async (filters: Record<string, any> = {}) => {
  const warehouseId =
    Number(filters.warehouse_id) ||
    (await getWarehouseIdByCode('STORE')) ||
    (await getDefaultWarehouseId());
  const sql = `
    SELECT
      p.id, p.sku, p.name_ar, p.unit, p.purchase_price, p.sale_price,
      p.category_id, pc.name_ar AS category_name,
      COALESCE(inv.quantity, 0) AS store_stock,
      COALESCE(sold.total_qty, 0) AS total_qty_sold,
      COALESCE(sold.total_revenue, 0) AS total_revenue,
      0::numeric AS total_cost_sold,
      0::numeric AS net_profit,
      CASE WHEN r.id IS NOT NULL THEN TRUE ELSE FALSE END AS has_recipe,
      r.id AS recipe_id,
      r.name_ar AS recipe_name,
      (SELECT COUNT(*) FROM product_recipe_items ri WHERE ri.recipe_id = r.id) AS recipe_items_count
    FROM products p
    LEFT JOIN product_categories pc ON pc.id = p.category_id
    LEFT JOIN inventory inv ON inv.product_id = p.id AND inv.warehouse_id = $1
    LEFT JOIN product_recipes r ON r.product_id = p.id AND r.deleted_at IS NULL AND r.is_active = TRUE
    LEFT JOIN (
      SELECT si.product_id,
        SUM(si.quantity) AS total_qty,
        SUM(si.total_amount) AS total_revenue
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      WHERE s.deleted_at IS NULL AND s.status = 'completed' AND s.sale_type = 'branch'
      GROUP BY si.product_id
    ) sold ON sold.product_id = p.id
    WHERE p.deleted_at IS NULL
      AND (
        p.primary_warehouse_id = $1
        OR EXISTS (SELECT 1 FROM inventory i2 WHERE i2.product_id = p.id AND i2.warehouse_id = $1)
      )
    ORDER BY pc.sort_order, p.name_ar
  `;
  const rows = (await query(sql, [warehouseId])).rows;
  const costs = await getProductsEffectiveCosts(
    { query },
    rows.map((row) => row.id),
  );

  return rows.map((row) => {
    const effective = costs.get(Number(row.id)) || {
      cost: Number(row.purchase_price || 0),
      source: 'purchase_price',
    };
    const totalQtySold = Number(row.total_qty_sold || 0);
    const totalRevenue = Number(row.total_revenue || 0);
    const unitCost = Number(effective.cost || 0);
    const totalCostSold = Math.round(totalQtySold * unitCost * 100) / 100;
    return {
      ...row,
      purchase_price: unitCost,
      effective_cost: unitCost,
      cost_source: effective.source,
      total_cost_sold: totalCostSold,
      net_profit: Math.round((totalRevenue - totalCostSold) * 100) / 100,
    };
  });
};

/**
 * EF*,'* 'DA19: 'DEF*,'* 'D*J DG' E.2HF AJ E.2F 'DA19 E9 (J'F'* 'DH5A) H'DE.2HF 'D-'DJ DCD ECHF
 */
/**
 * Ù…Ù†ØªØ¬Ø§Øª Ø§Ù„ÙØ±Ø¹ Ù„Ù„Ø¨ÙŠØ¹ Ø§Ù„Ø³Ø±ÙŠØ¹ (Ù…Ø¹ ÙÙ„ØªØ±Ø© ÙˆØªØ±Ù‚ÙŠÙ…).
 * @param {Record<string, any>} [filters] Ø®ÙŠØ§Ø±Ø§Øª Ø§Ù„ÙÙ„ØªØ±Ø© (search, category_id...)
 * @returns {Promise<{ rows: any[], total: number }>}
 */
export const getBranchProducts = async (filters: Record<string, any> = {}) => {
  const warehouseId =
    Number(filters.warehouse_id) ||
    (await getWarehouseIdByCode('STORE')) ||
    (await getDefaultWarehouseId());
  let sql = `
    SELECT
      p.id, p.sku, p.barcode, p.name_ar, p.unit, p.sale_price, p.purchase_price,
      p.category_id, pc.name_ar AS category_name,
      p.primary_warehouse_id,
      (SELECT name_ar FROM warehouses w WHERE w.id = p.primary_warehouse_id) AS primary_warehouse_name,
      COALESCE((SELECT SUM(quantity) FROM inventory i WHERE i.product_id = p.id AND i.warehouse_id = $1), 0) AS store_stock,
      CASE WHEN r.id IS NOT NULL THEN TRUE ELSE FALSE END AS has_recipe,
      r.id AS recipe_id,
      r.name_ar AS recipe_name,
      COALESCE((
        SELECT json_agg(json_build_object(
          'ingredient_product_id', ri.ingredient_product_id,
          'ingredient_name', ip.name_ar,
          'ingredient_unit', ip.unit,
          'quantity', ri.quantity,
          'unit_code', ri.unit_code,
          'stock_available', COALESCE((SELECT SUM(ii.quantity) FROM inventory ii WHERE ii.product_id = ri.ingredient_product_id AND ii.warehouse_id = $1), 0)
        ) ORDER BY ri.sort_order, ri.id)
        FROM product_recipe_items ri
        JOIN products ip ON ip.id = ri.ingredient_product_id
        WHERE ri.recipe_id = r.id
      ), '[]'::json) AS recipe_items
    FROM products p
    LEFT JOIN product_categories pc ON pc.id = p.category_id
    LEFT JOIN product_recipes r ON r.product_id = p.id AND r.deleted_at IS NULL AND r.is_active = TRUE
    WHERE p.deleted_at IS NULL
  `;
  const params: unknown[] = [warehouseId];
  let i = 2;

  if (filters.category_id) {
    sql += ` AND p.category_id = $${i++}`;
    params.push(filters.category_id);
  }
  if (filters.search) {
    sql += ` AND (p.name_ar ILIKE $${i} OR p.sku ILIKE $${i} OR p.barcode ILIKE $${i})`;
    params.push(`%${filters.search}%`);
  }
  if (filters.has_recipe === 'true' || filters.has_recipe === true) {
    sql += ` AND r.id IS NOT NULL`;
  }

  sql += ` ORDER BY pc.sort_order, p.name_ar`;
  const rows = (await query(sql, params)).rows;
  // ensure recipe_items is always a proper array
  return rows.map((r) => ({
    ...r,
    recipe_items: Array.isArray(r.recipe_items)
      ? r.recipe_items
      : typeof r.recipe_items === 'string' && r.recipe_items.trim()
        ? JSON.parse(r.recipe_items)
        : [],
  }));
};

/** Ø¥Ù†Ø´Ø§Ø¡ ØªØµÙ†ÙŠÙ Ø¬Ø¯ÙŠØ¯. */
export const createCategory = async (data: Record<string, any>) => {
  const result = await query(
    `INSERT INTO product_categories (name_ar, slug, parent_id, sort_order) VALUES ($1,$2,$3,$4) RETURNING *`,
    [
      data.name_ar,
      data.slug || data.name_ar.replace(/\s/g, '-'),
      data.parent_id,
      data.sort_order || 0,
    ],
  );
  return result.rows[0];
};

/** ØªØ­Ø¯ÙŠØ« ØªØµÙ†ÙŠÙ. */
export const updateCategory = async (id: number, data: Record<string, any>) => {
  const result = await query(
    `UPDATE product_categories
     SET name_ar = COALESCE($1, name_ar),
         slug = COALESCE($2, slug),
         parent_id = COALESCE($3, parent_id),
         sort_order = COALESCE($4, sort_order)
     WHERE id = $5 AND deleted_at IS NULL
     RETURNING *`,
    [data.name_ar, data.slug, data.parent_id, data.sort_order, id],
  );
  if (!result.rows[0]) throw new AppError('Ø§Ù„ØªØµÙ†ÙŠÙ ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯', 404);
  return result.rows[0];
};

/** Ø­Ø°Ù ØªØµÙ†ÙŠÙ (Ø­Ø°Ù Ù†Ø§Ø¹Ù…). */
export const deleteCategory = async (id: number) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const category = await client.query(
      `SELECT id FROM product_categories WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    if (!category.rows[0]) throw new AppError('Ø§Ù„ØªØµÙ†ÙŠÙ ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯', 404);

    await client.query(`UPDATE products SET category_id = NULL WHERE category_id = $1`, [id]);
    await client.query(`UPDATE product_categories SET deleted_at = NOW() WHERE id = $1`, [id]);
    await client.query('COMMIT');
    appCache.invalidateByTag('product_cost');
    appCache.invalidateByTag('products');
    invalidateDashboardCache();
    return { id };
  } catch (err: any) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/** Ø¬Ù„Ø¨ Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„ÙˆØ­Ø¯Ø§Øª. */
export const getUnits = async () => {
  return (
    await query(
      `SELECT pu.id, pu.name_ar, pu.sort_order,
            COUNT(p.id)::int AS products_count
     FROM product_units pu
     LEFT JOIN products p ON p.unit = pu.name_ar AND p.deleted_at IS NULL
     WHERE pu.deleted_at IS NULL
     GROUP BY pu.id
     ORDER BY pu.sort_order, pu.name_ar`,
    )
  ).rows;
};

/** Ø¥Ù†Ø´Ø§Ø¡ ÙˆØ­Ø¯Ø© Ù‚ÙŠØ§Ø³ Ø¬Ø¯ÙŠØ¯Ø©. */
export const createUnit = async (data: Record<string, any>) => {
  const result = await query(
    `INSERT INTO product_units (name_ar, sort_order) VALUES ($1, $2) RETURNING *`,
    [data.name_ar, data.sort_order ?? 0],
  );
  return result.rows[0];
};

/** ØªØ­Ø¯ÙŠØ« ÙˆØ­Ø¯Ø© Ù‚ÙŠØ§Ø³. */
export const updateUnit = async (id: number, data: Record<string, any>) => {
  const result = await query(
    `UPDATE product_units
     SET name_ar = COALESCE($1, name_ar),
         sort_order = COALESCE($2, sort_order),
         updated_at = NOW()
     WHERE id = $3 AND deleted_at IS NULL
     RETURNING *`,
    [data.name_ar, data.sort_order, id],
  );
  if (!result.rows[0]) throw new AppError('Ø§Ù„ÙˆØ­Ø¯Ø© ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯Ø©', 404);
  return result.rows[0];
};

/** Ø­Ø°Ù ÙˆØ­Ø¯Ø© Ù‚ÙŠØ§Ø³. */
export const deleteUnit = async (id: number) => {
  const unit = await query(
    `SELECT name_ar FROM product_units WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
  if (!unit.rows[0]) throw new AppError('Ø§Ù„ÙˆØ­Ø¯Ø© ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯Ø©', 404);
  await query(`UPDATE product_units SET deleted_at = NOW() WHERE id = $1`, [id]);
  return { id };
};

/**
 * ØªØ¹Ø¯ÙŠÙ„ Ø£Ø³Ø¹Ø§Ø± Ù…Ø¬Ù…ÙˆØ¹Ø© Ù…Ù†ØªØ¬Ø§Øª Ø¯ÙØ¹Ø© ÙˆØ§Ø­Ø¯Ø© (Ù†Ø³Ø¨Ø© Ø£Ùˆ Ù…Ø¨Ù„Øº Ø«Ø§Ø¨Øª).
 * @param {Record<string, any>} data Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„ØªØ¹Ø¯ÙŠÙ„ (category_id, type, adjust_type, value)
 * @param {number} userId Ù…Ø¹Ø±Ù Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù… Ø§Ù„Ù…Ù†ÙÙ‘Ø°
 * @returns {Promise<{ updated: number }>}
 */
export const bulkAdjustPrices = async (data: Record<string, any>, __userId: number) => {
  const { category_id, type, value, adjust_type, all_products } = data;
  const val = Number(value);
  if (!Number.isFinite(val)) throw new AppError('القيمة غير صالحة', 400);

  if (!category_id && !all_products) {
    throw new AppError(
      'يجب تحديد التصنيف المطلوب تعديل أسعاره، أو تأكيد التطبيق على جميع المنتجات (all_products: true)',
      400,
    );
  }

  let sql = `UPDATE products SET `;
  const params: any[] = [];

  if (type === 'sale') {
    if (adjust_type === 'percent') {
      sql += `sale_price = GREATEST(0, ROUND(sale_price * (1 + $1::numeric / 100), 2))`;
    } else {
      sql += `sale_price = GREATEST(0, ROUND(sale_price + $1::numeric, 2))`;
    }
  } else if (type === 'purchase') {
    if (adjust_type === 'percent') {
      sql += `purchase_price = GREATEST(0, ROUND(purchase_price * (1 + $1::numeric / 100), 2))`;
    } else {
      sql += `purchase_price = GREATEST(0, ROUND(purchase_price + $1::numeric, 2))`;
    }
  } else {
    throw new AppError('نوع السعر المراد تعديله غير صالح', 400);
  }

  params.push(val);
  sql += `, updated_at = NOW() WHERE deleted_at IS NULL`;

  if (category_id) {
    sql += ` AND category_id = $2`;
    params.push(Number(category_id));
  }

  const result = await query(sql, params);
  return { updatedCount: result.rowCount };
};
