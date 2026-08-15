import { AppError } from '../types/errors.ts';
import { getClient, query } from '../database/pool.ts';
import {
  calculateRecipeCost,
  unitPriceFor,
  UNIT_ALIASES,
  normalizeUnit,
  convertQty,
} from './productCostService.ts';
import { consumeRecipeForSale as _consumeRecipe } from './recipesService.ts';
import { invalidateDashboardCache } from './dashboardService.ts';

const WEIGHT_UNITS = new Set(['g', 'kg']);
const VOLUME_UNITS = new Set(['ml', 'l']);
const unitGroup = (u) =>
  WEIGHT_UNITS.has(u) ? 'weight' : VOLUME_UNITS.has(u) ? 'volume' : u === 'count' ? 'count' : null;

const enrichRecipeCost = (recipe, effectiveIngredientCostsMap) => {
  const items = Array.isArray(recipe.items) ? recipe.items : [];
  const enrichedItems = items.map((it) => {
    const qty = Number(it.quantity || 0);

    const effective = effectiveIngredientCostsMap?.get?.(Number(it.ingredient_product_id));
    const ingredientCost = Number(it.ingredient_purchase_price || 0);
    const effectiveCost =
      Number.isFinite(Number(effective?.cost)) && Number(effective?.cost) > 0
        ? Number(effective.cost)
        : ingredientCost;

    const unitPrice = unitPriceFor(effectiveCost, it.ingredient_unit, it.unit_code);
    const itemCost = unitPrice == null ? 0 : qty * unitPrice;
    return {
      ...it,
      ingredient_unit_price: unitPrice,
      estimated_cost: itemCost,
    };
  });

  return {
    ...recipe,
    items: enrichedItems,
    estimated_total_cost: calculateRecipeCost(enrichedItems),
  };
};

const normalizeRecipeItems = (items: any[] = []) => {
  if (!Array.isArray(items) || !items.length) throw new AppError('يجب إضافة مكونات للوصفة');
  return items.map((item, idx) => {
    const ingredient_product_id = Number(item.ingredient_product_id);
    const quantity = Number(item.quantity);
    const unit_code = normalizeUnit(item.unit_code);
    if (!ingredient_product_id) throw new AppError(`السطر ${idx + 1}: يجب اختيار منتج مكوّن`);
    if (!quantity || quantity <= 0)
      throw new AppError(`السطر ${idx + 1}: الكمية يجب أن تكون أكبر من صفر`);
    if (!unit_code) throw new AppError(`السطر ${idx + 1}: يجب تحديد وحدة صحيحة`);
    return {
      ingredient_product_id,
      quantity,
      unit_code,
      notes: item.notes || null,
      sort_order: idx,
    };
  });
};

/**
 * جلب قائمة الوصفات الإنتاجية.
 * @returns {Promise<any[]>}
 */
export const getRecipes = async () => {
  const sql = `
    SELECT r.*, p.name_ar as product_name, p.sku as product_sku, p.unit as product_unit,
      COALESCE((
        SELECT json_agg(json_build_object(
          'id', ri.id,
          'ingredient_product_id', ri.ingredient_product_id,
          'ingredient_name', ip.name_ar,
          'ingredient_sku', ip.sku,
          'ingredient_unit', ip.unit,
          'ingredient_purchase_price',
          COALESCE(
            NULLIF(ip.purchase_price, 0),
            0
          ),
          'quantity', ri.quantity,
          'unit_code', ri.unit_code,
          'notes', ri.notes
        ) ORDER BY ri.sort_order, ri.id)
        FROM product_recipe_items ri
        JOIN products ip ON ip.id = ri.ingredient_product_id
        WHERE ri.recipe_id = r.id
      ), '[]'::json) as items
    FROM product_recipes r
    JOIN products p ON p.id = r.product_id
    WHERE r.deleted_at IS NULL
    ORDER BY r.id DESC
  `;
  const rows = (await query(sql)).rows;

  // Build effective costs map for all ingredients referenced in all recipes
  const ingredientIds = new Set();
  for (const r of rows) {
    for (const it of r.items || []) {
      if (it?.ingredient_product_id) ingredientIds.add(Number(it.ingredient_product_id));
    }
  }

  // إصلاح N+1: بدلاً من query لكل مكوّن على حدة (كان ممكن 200+ query)،
  // نستخدم getProductsEffectiveCosts التي تجلب التكاليف دفعة واحدة مع cache داخلي
  const costClient = await getClient();
  try {
    const { getProductsEffectiveCosts } = await import('./productCostService.ts');
    const effectiveIngredientCostsMap = await getProductsEffectiveCosts(costClient, [
      ...ingredientIds,
    ]);
    return rows.map((r) => enrichRecipeCost(r, effectiveIngredientCostsMap));
  } finally {
    costClient.release();
  }
};

// BUG-07 FIX: استخدام query مباشر بدل جلب كل الوصفات — O(1) بدل O(N)
/** جلب وصفة واحدة بمكوناتها. */
export const getRecipeById = async (id: number) => {
  const sql = `
    SELECT r.*, p.name_ar as product_name, p.sku as product_sku, p.unit as product_unit,
      COALESCE((
        SELECT json_agg(json_build_object(
          'id', ri.id,
          'ingredient_product_id', ri.ingredient_product_id,
          'ingredient_name', ip.name_ar,
          'ingredient_sku', ip.sku,
          'ingredient_unit', ip.unit,
          'ingredient_purchase_price', COALESCE(NULLIF(ip.purchase_price, 0), 0),
          'quantity', ri.quantity,
          'unit_code', ri.unit_code,
          'notes', ri.notes
        ) ORDER BY ri.sort_order, ri.id)
        FROM product_recipe_items ri
        JOIN products ip ON ip.id = ri.ingredient_product_id
        WHERE ri.recipe_id = r.id
      ), '[]'::json) as items
    FROM product_recipes r
    JOIN products p ON p.id = r.product_id
    WHERE r.deleted_at IS NULL AND r.id = $1
  `;
  const row = (await query(sql, [Number(id)])).rows[0];
  if (!row) throw new AppError('الوصفة غير موجودة', 404);

  // حساب التكاليف الفعلية لهذه الوصفة فقط (costClient + enrichRecipeCost)
  const ingredientIds = (row.items || [])
    .map((it) => Number(it.ingredient_product_id))
    .filter(Boolean);
  const costClient = await getClient();
  try {
    const { getProductsEffectiveCosts } = await import('./productCostService.ts');
    const costsMap = await getProductsEffectiveCosts(costClient, ingredientIds);
    return enrichRecipeCost(row, costsMap);
  } finally {
    costClient.release();
  }
};

const updateProductPriceFromLatestPurchaseInvoice = async (client, productId) => {
  await client.query(
    `UPDATE products
     SET purchase_price = COALESCE((
       SELECT pii.unit_price
       FROM purchase_invoice_items pii
       JOIN purchase_invoices pi ON pi.id = pii.purchase_invoice_id
       WHERE pii.product_id = $1
         AND pi.deleted_at IS NULL
       ORDER BY pi.invoice_date DESC, pi.id DESC, pii.id DESC
       LIMIT 1
     ), purchase_price),
     updated_at = NOW()
     WHERE id = $1`,
    [productId],
  );
};

/**
 * إنشاء وصفة إنتاجية جديدة.
 * @param {Record<string, any>} data بيانات الوصفة (product_id, items...)
 * @param {number} userId معرف المستخدم المنفّذ
 * @returns {Promise<any>}
 */
export const createRecipe = async (data: Record<string, any>, userId: number) => {
  const product_id = Number(data.product_id);
  if (!product_id) throw new AppError('المنتج الرئيسي مطلوب');
  const items = normalizeRecipeItems(data.items);
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const exists = await client.query(
      `SELECT id FROM product_recipes WHERE product_id = $1 AND deleted_at IS NULL`,
      [product_id],
    );
    if (exists.rows[0])
      throw new AppError('هذه الوصفة موجودة بالفعل لهذا المنتج. استخدم تعديل الوصفة الموجودة.');

    const ins = await client.query(
      `INSERT INTO product_recipes (product_id, name_ar, is_active, notes, created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [
        product_id,
        data.name_ar || `وصفة المنتج ${product_id}`,
        data.is_active !== false,
        data.notes || null,
        userId,
      ],
    );
    const recipe = ins.rows[0];

    for (const item of items) {
      await client.query(
        `INSERT INTO product_recipe_items (recipe_id, ingredient_product_id, quantity, unit_code, notes, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          recipe.id,
          item.ingredient_product_id,
          item.quantity,
          item.unit_code,
          item.notes,
          item.sort_order,
        ],
      );
    }

    await client.query('COMMIT');
    invalidateDashboardCache();
    return getRecipeById(recipe.id);
  } catch (e: any) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
};

/**
 * تحديث وصفة إنتاجية.
 * @param {number} id معرف الوصفة
 * @param {Record<string, any>} data الحقول الجديدة
 * @returns {Promise<any>}
 */
export const updateRecipe = async (id: number, data: Record<string, any>) => {
  const items = normalizeRecipeItems(data.items);
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const current = await client.query(
      `SELECT * FROM product_recipes WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    if (!current.rows[0]) throw new AppError('الوصفة غير موجودة', 404);

    await client.query(
      `UPDATE product_recipes SET name_ar = $1, is_active = $2, notes = $3, updated_at = NOW() WHERE id = $4`,
      [data.name_ar || current.rows[0].name_ar, data.is_active !== false, data.notes || null, id],
    );
    await client.query(`DELETE FROM product_recipe_items WHERE recipe_id = $1`, [id]);
    for (const item of items) {
      await client.query(
        `INSERT INTO product_recipe_items (recipe_id, ingredient_product_id, quantity, unit_code, notes, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          id,
          item.ingredient_product_id,
          item.quantity,
          item.unit_code,
          item.notes,
          item.sort_order,
        ],
      );
    }

    await client.query('COMMIT');
    invalidateDashboardCache();
    return getRecipeById(id);
  } catch (e: any) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
};

/** حذف وصفة إنتاجية. */
export const deleteRecipe = async (id: number) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const current = await client.query(
      `SELECT id, product_id FROM product_recipes WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [id],
    );
    if (!current.rows[0]) throw new AppError('الوصفة غير موجودة', 404);

    await client.query(
      `UPDATE product_recipes SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [id],
    );
    await updateProductPriceFromLatestPurchaseInvoice(client, current.rows[0].product_id);

    await client.query('COMMIT');
    invalidateDashboardCache();
  } catch (e: any) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
};

// استهلاك الوصفة عند البيع يتم عبر recipesService (الكمية النهائية)
/**
 * استهلاك مكونات الوصفة عند بيع منتج مُصنّع.
 * @param {import('pg').PoolClient} client عميل المعاملة
 * @param {{ productId: number, soldQty: number, warehouseId: number, invoiceId?: number, userId: number }} args بيانات الاستهلاك
 * @returns {Promise<void>}
 */
export const consumeRecipeForSale = async (
  client,
  { productId, soldQty, warehouseId, invoiceId, userId },
) =>
  _consumeRecipe(client, {
    productId,
    soldQty,
    warehouseId,
    referenceType: 'invoice',
    referenceId: invoiceId,
    userId,
  });
