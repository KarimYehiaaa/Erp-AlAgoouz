import { getClient, query } from '../database/pool.ts';
import { AppError } from '../types/errors.ts';
import { getProductsEffectiveCosts } from './productCostService.ts';
import { getDefaultWarehouseId, getWarehouseIdByCode } from './warehouseService.ts';
import { adjustStock, ensureInventoryRow } from './inventoryService.ts';
import { getAllowedWarehouses } from '../middleware/warehouseAccess.ts';
import { sanitizeLimit, toNumber } from '../utils/money.ts';
import type { PoolClient } from 'pg';

/**
 * جلب قائمة المنتجات مع فلترة وبحث وترقيم.
 * @param {Record<string, any>} [filters] خيارات الفلترة (search, category_id, warehouse_id, is_active...)
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
 * جلب منتج واحد كاملاً مع الوصفة والمخزون.
 * @param {number} id معرف المنتج
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
  if (!result.rows[0]) throw new AppError('المنتج غير موجود', 404);
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

/** توليد رقم SKU تلقائي للمنتج التالي. */
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
 * إنشاء منتج جديد مع الأرصدة الافتتاحية والمخازن.
 * @param {Record<string, any>} data بيانات المنتج
 * @returns {Promise<any>}
 */
const applyProductStocks = async (
  client: import('pg').PoolClient,
  productId: number,
  data: Record<string, any>,
  userId?: number,
  allowInitialStock = false,
) => {
  const absolute = data.warehouse_stocks != null;
  const stocks = absolute
    ? data.warehouse_stocks
    : allowInitialStock
      ? data.initial_stock
      : undefined;
  if (stocks == null) return;
  if (typeof stocks !== 'object' || Array.isArray(stocks))
    throw new AppError('أرصدة المخازن غير صالحة', 400);
  const entries = Object.entries(stocks).sort(([a], [b]) => Number(a) - Number(b));
  if (!entries.length) return;
  if (!Number.isSafeInteger(userId) || Number(userId) <= 0)
    throw new AppError('المستخدم مطلوب لتعديل المخزون', 403);
  const allowed = await getAllowedWarehouses(Number(userId), client);
  for (const [key, raw] of entries) {
    const warehouseId = Number(key);
    if (!Number.isSafeInteger(warehouseId) || warehouseId <= 0 || !allowed.includes(warehouseId))
      throw new AppError('المخزن خارج نطاق صلاحياتك', 403);
    const quantity = toNumber(raw, NaN);
    const units = Math.round(quantity * 1000);
    if (
      !Number.isFinite(quantity) ||
      quantity < 0 ||
      quantity > 999999999.999 ||
      !Number.isSafeInteger(units) ||
      Math.abs(quantity * 1000 - units) > 0.000001
    )
      throw new AppError('رصيد المخزن غير صالح', 400);
    const current = await client.query(
      'SELECT quantity FROM inventory WHERE product_id = $1 AND warehouse_id = $2 ORDER BY id FOR UPDATE',
      [productId, warehouseId],
    );
    const currentQuantity = current.rows.reduce((sum, row) => sum + Number(row.quantity), 0);
    const target = absolute ? quantity : currentQuantity + quantity;
    // Metadata-only saves may include unchanged balances of inactive or recipe products.
    if (Math.abs(target - currentQuantity) < 0.000001) continue;
    await adjustStock(
      {
        product_id: productId,
        warehouse_id: warehouseId,
        quantity: target,
        notes: 'تسوية رصيد من حفظ المنتج',
      },
      Number(userId),
      client,
    );
  }
};

const validateProductCategory = async (client: PoolClient, value: unknown) => {
  if (value === undefined || value === null) return;
  if (!['string', 'number'].includes(typeof value)) throw new AppError('التصنيف غير صالح', 400);
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647)
    throw new AppError('التصنيف غير صالح', 400);
  // Acquire before product row locks, matching category deletion and Excel import.
  await lockCategoryHierarchy(client);
  const category = await client.query(
    'SELECT id FROM product_categories WHERE id = $1 AND deleted_at IS NULL FOR SHARE',
    [id],
  );
  if (!category.rows[0]) throw new AppError('التصنيف غير موجود', 404);
};

export const createProduct = async (
  data: Record<string, any>,
  transactionClient?: import('pg').PoolClient,
  userId?: number,
) => {
  const ownsTransaction = !transactionClient;
  const client = transactionClient ?? (await getClient());
  try {
    if (ownsTransaction) await client.query('BEGIN');

    await validateProductCategory(client, data.category_id);
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
        data.min_stock ?? 5,
        data.image_url,
        data.is_active ?? true,
        data.track_expiry ?? false,
        data.primary_warehouse_id || null,
      ],
    );
    await applyProductStocks(client, result.rows[0].id, data, userId, true);

    if (ownsTransaction) {
      await client.query('COMMIT');
    }
    return result.rows[0];
  } catch (err: any) {
    if (ownsTransaction) await client.query('ROLLBACK');
    throw err;
  } finally {
    if (ownsTransaction) client.release();
  }
};

/**
 * تحديث منتج (بيانات، مخازن، أرصدة).
 * @param {number} id معرف المنتج
 * @param {Record<string, any>} data الحقول المطلوب تحديثها
 * @returns {Promise<any>}
 */
export const updateProduct = async (
  id: number,
  data: Record<string, any>,
  transactionClient?: import('pg').PoolClient,
  userId?: number,
) => {
  const ownsTransaction = !transactionClient;
  const client = transactionClient ?? (await getClient());
  try {
    if (ownsTransaction) await client.query('BEGIN');

    await validateProductCategory(client, data.category_id);
    const existingRes = await client.query(
      'SELECT p.id, p.primary_warehouse_id, EXISTS (SELECT 1 FROM product_recipes r WHERE r.product_id = p.id AND r.deleted_at IS NULL AND r.is_active = TRUE) AS has_active_recipe FROM products p WHERE p.id = $1 AND p.deleted_at IS NULL FOR UPDATE',
      [id],
    );
    const existing = existingRes.rows[0];
    if (!existing) throw new AppError('المنتج غير موجود', 404);

    const warehouseProvided = data.primary_warehouse_id !== undefined;
    const nextWarehouseId = warehouseProvided
      ? Number(data.primary_warehouse_id) || null
      : existing.primary_warehouse_id || null;
    const warehouseChanged =
      warehouseProvided &&
      Number(nextWarehouseId || 0) !== Number(existing.primary_warehouse_id || 0);

    if (warehouseChanged) {
      if (existing.has_active_recipe) {
        throw new AppError('لا يمكن تغيير مخزن منتج مرتبط بوصفة نشطة', 400);
      }
      const warehouseRes = await client.query(
        'SELECT id FROM warehouses WHERE id = $1 AND deleted_at IS NULL AND is_active = TRUE',
        [nextWarehouseId],
      );
      if (!warehouseRes.rows[0]) throw new AppError('المخزن غير موجود', 404);
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

    await applyProductStocks(client, id, data, userId);

    if (ownsTransaction) {
      await client.query('COMMIT');
      return getProductById(id);
    }
    return (await client.query('SELECT * FROM products WHERE id = $1', [id])).rows[0];
  } catch (err: any) {
    if (ownsTransaction) await client.query('ROLLBACK');
    throw err;
  } finally {
    if (ownsTransaction) client.release();
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
    return { deletedCount: result.rowCount || 0 };
  } catch (err: any) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/** جلب شجرة التصنيفات. */
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
 * تقرير تكاليف المنتجات.
 * @param {Record<string, any>} [filters] خيارات التقرير (warehouse_id...)
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
      WHERE s.deleted_at IS NULL AND s.status = 'completed' AND s.sale_type IN ('retail', 'pos')
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
 * منتجات المحل للبيع السريع (مع فلترة وترقيم).
 * @param {Record<string, any>} [filters] خيارات الفلترة (search, category_id...)
 * @returns {Promise<{ rows: any[], total: number }>}
 */
export const getShopProducts = async (filters: Record<string, any> = {}) => {
  const warehouseId =
    Number(filters.warehouse_id) ||
    (await getWarehouseIdByCode('STORE')) ||
    (await getDefaultWarehouseId());
  let sql = `
    SELECT
      p.id, p.sku, p.barcode, p.name_ar, p.unit, p.sale_price, p.purchase_price,
      p.image_url, p.is_active, p.min_stock,
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

export const lockCategoryHierarchy = (client: PoolClient) =>
  client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
    'alagoouz.product_category_hierarchy',
  ]);

const parseCategoryParent = (value: unknown): number | null => {
  if (value == null) return null;
  if (!['string', 'number'].includes(typeof value) || String(value).trim() === '')
    throw new AppError('التصنيف الأب غير صالح', 400);
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new AppError('التصنيف الأب غير صالح', 400);
  return id;
};

const validateCategoryParent = async (
  client: PoolClient,
  parentId: number | null,
  categoryId?: number,
) => {
  if (parentId === null) return;
  if (parentId === categoryId) throw new AppError('لا يمكن ربط التصنيف بنفسه', 400);
  const ancestors = await client.query(
    `WITH RECURSIVE ancestors AS (
       SELECT id, parent_id, deleted_at FROM product_categories WHERE id = $1
       UNION
       SELECT pc.id, pc.parent_id, pc.deleted_at FROM product_categories pc
       JOIN ancestors a ON pc.id = a.parent_id
     ) SELECT id, parent_id, deleted_at FROM ancestors`,
    [parentId],
  );
  const rows = new Map<number, { parent_id: number | null; deleted_at: unknown }>(
    ancestors.rows.map((row) => [Number(row.id), row]),
  );
  if (!rows.has(parentId) || rows.get(parentId)!.deleted_at)
    throw new AppError('التصنيف الأب غير موجود', 404);
  const visited = new Set<number>();
  let current: number | null = parentId;
  while (current !== null) {
    if (current === categoryId || visited.has(current))
      throw new AppError('لا يمكن إنشاء دورة في شجرة التصنيفات', 400);
    const row = rows.get(current);
    if (!row || row.deleted_at) throw new AppError('سلسلة التصنيف الأب غير صالحة', 400);
    visited.add(current);
    current = row.parent_id === null ? null : Number(row.parent_id);
  }
};

/** إنشاء تصنيف جديد. */
export const createCategory = async (data: Record<string, any>) => {
  const parentId = parseCategoryParent(data.parent_id);
  const client = await getClient();
  try {
    await client.query('BEGIN');
    await lockCategoryHierarchy(client);
    await validateCategoryParent(client, parentId);
    const result = await client.query(
      `INSERT INTO product_categories (name_ar, slug, parent_id, sort_order) VALUES ($1,$2,$3,$4) RETURNING *`,
      [data.name_ar, data.slug || data.name_ar.replace(/\s/g, '-'), parentId, data.sort_order || 0],
    );
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/** تحديث تصنيف. */
export const updateCategory = async (id: number, data: Record<string, any>) => {
  const parentProvided = data.parent_id !== undefined;
  const parentId = parseCategoryParent(data.parent_id);
  const categoryId = Number(id);
  const client = await getClient();
  try {
    await client.query('BEGIN');
    await lockCategoryHierarchy(client);
    const existing = await client.query(
      'SELECT id FROM product_categories WHERE id = $1 AND deleted_at IS NULL FOR NO KEY UPDATE',
      [id],
    );
    if (!existing.rows[0]) throw new AppError('التصنيف غير موجود', 404);
    if (parentProvided) await validateCategoryParent(client, parentId, categoryId);
    const result = await client.query(
      `UPDATE product_categories
     SET name_ar = COALESCE($1, name_ar),
         slug = COALESCE($2, slug),
         parent_id = CASE WHEN $3::boolean THEN $4::int ELSE parent_id END,
         sort_order = COALESCE($5, sort_order)
     WHERE id = $6 AND deleted_at IS NULL
     RETURNING *`,
      [data.name_ar, data.slug, parentProvided, parentId, data.sort_order, id],
    );
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/** حذف تصنيف (حذف ناعم). */
export const deleteCategory = async (id: number) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    await lockCategoryHierarchy(client);
    const category = await client.query(
      `SELECT id FROM product_categories WHERE id = $1 AND deleted_at IS NULL FOR NO KEY UPDATE`,
      [id],
    );
    if (!category.rows[0]) throw new AppError('التصنيف غير موجود', 404);

    await client.query(`UPDATE products SET category_id = NULL WHERE category_id = $1`, [id]);
    await client.query('UPDATE product_categories SET parent_id = NULL WHERE parent_id = $1', [id]);
    await client.query(`UPDATE product_categories SET deleted_at = NOW() WHERE id = $1`, [id]);
    await client.query('COMMIT');
    return { id };
  } catch (err: any) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/** جلب قائمة الوحدات. */
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

/** إنشاء وحدة قياس جديدة. */
export const createUnit = async (data: Record<string, any>) => {
  const result = await query(
    `INSERT INTO product_units (name_ar, sort_order) VALUES ($1, $2) RETURNING *`,
    [data.name_ar, data.sort_order ?? 0],
  );
  return result.rows[0];
};

/** تحديث وحدة قياس. */
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
  if (!result.rows[0]) throw new AppError('الوحدة غير موجودة', 404);
  return result.rows[0];
};

/** حذف وحدة قياس. */
export const deleteUnit = async (id: number) => {
  const unit = await query(
    `SELECT name_ar FROM product_units WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
  if (!unit.rows[0]) throw new AppError('الوحدة غير موجودة', 404);
  await query(`UPDATE product_units SET deleted_at = NOW() WHERE id = $1`, [id]);
  return { id };
};

/** Read the current user's stored bulk price result without repeating the operation. */
export const getBulkPriceAdjustmentStatus = async (
  operationKey: string,
  userId: number,
  actionPath = '/api/v1/products/bulk-price',
) => {
  if (typeof operationKey !== 'string' || !/^[a-zA-Z0-9-]{1,50}$/.test(operationKey))
    throw new AppError('مفتاح العملية غير صالح', 400);
  if (!Number.isSafeInteger(userId) || userId <= 0) throw new AppError('المستخدم غير صالح', 403);
  const scopedKey = `user:${userId}:PUT:${actionPath}:${operationKey}`;
  const record = (
    await query(
      'SELECT status, status_code, response_body FROM idempotency_records WHERE key = $1 AND user_id = $2 AND request_path = $3',
      [scopedKey, userId, actionPath],
    )
  ).rows[0];
  if (!record) return { state: 'absent' as const };
  if (record.status === 'PROCESSING') return { state: 'processing' as const };
  let body = record.response_body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return { state: 'unconfirmed' as const };
    }
  }
  const count = body?.data?.updatedCount;
  if (
    record.status === 'COMPLETED' &&
    record.status_code >= 200 &&
    record.status_code < 300 &&
    body?.success === true &&
    Number.isSafeInteger(count) &&
    count >= 0
  )
    return { state: 'completed' as const, updatedCount: count as number };
  // A recorded server error cannot prove whether the financial operation committed.
  return { state: 'unconfirmed' as const };
};

/** Adjust prices and record the actor and scope in one transaction. */
export const bulkAdjustPrices = async (data: Record<string, any>, userId: number) => {
  const { category_id, type, value, adjust_type, all_products } = data;
  const val = toNumber(value, NaN);
  if (
    value == null ||
    typeof value === 'boolean' ||
    String(value).trim() === '' ||
    !Number.isFinite(val) ||
    val < -100 ||
    val > 10_000_000
  )
    throw new AppError('القيمة غير صالحة', 400);
  if (!['percent', 'fixed'].includes(adjust_type))
    throw new AppError('طريقة التعديل غير صالحة', 400);
  if (!Number.isSafeInteger(userId) || userId <= 0) throw new AppError('المستخدم غير صالح', 403);

  const isAllProducts = all_products === true || all_products === 'true';
  let parsedCatId: number | null = null;

  if (!isAllProducts) {
    parsedCatId = Number(category_id);
    if (!Number.isSafeInteger(parsedCatId) || parsedCatId <= 0) {
      throw new AppError(
        'يجب تحديد التصنيف المطلوب تعديل أسعاره بشكل صحيح، أو تأكيد التطبيق على جميع المنتجات (all_products: true)',
        400,
      );
    }
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

  if (parsedCatId) {
    sql += ` AND category_id = $2`;
    params.push(parsedCatId);
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');
    const actor = await client.query(
      'SELECT id FROM users WHERE id = $1 AND is_active = TRUE AND deleted_at IS NULL',
      [userId],
    );
    if (!actor.rows[0]) throw new AppError('المستخدم غير صالح', 403);
    if (parsedCatId != null) {
      const category = await client.query(
        'SELECT id FROM product_categories WHERE id = $1 AND deleted_at IS NULL',
        [parsedCatId],
      );
      if (!category.rows[0]) throw new AppError('التصنيف المحدد غير موجود', 404);
    }
    const result = await client.query(sql, params);
    await client.query(
      'INSERT INTO activity_logs (user_id, module, action_ar, details) VALUES ($1,$2,$3,$4)',
      [
        userId,
        'products',
        'تعديل أسعار المنتجات جماعيًا',
        JSON.stringify({
          category_id: parsedCatId,
          all_products: isAllProducts,
          type,
          adjust_type,
          value: val,
          updated_count: result.rowCount,
        }),
      ],
    );
    await client.query('COMMIT');
    return { updatedCount: result.rowCount };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
