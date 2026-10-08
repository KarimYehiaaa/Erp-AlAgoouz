import { roundMoney } from '../utils/money.ts';
import { AppError } from '../types/errors.ts';

import { normalizeUnit } from '../../../shared/units.ts';
export { UNIT_ALIASES, normalizeUnit } from '../../../shared/units.ts';

/**
 * تحويل كمية بين وحدتين (كجم ↔ غرام، لتر ↔ مل).
 * @param {number} qty الكمية
 * @param {string} fromUnit وحدة المصدر
 * @param {string} toUnit وحدة الهدف
 * @returns {number}
 */
export const convertQty = (qty: number, fromUnit: string, toUnit: string) => {
  if (fromUnit === toUnit) return qty;
  if (fromUnit === 'kg' && toUnit === 'g') return qty * 1000;
  if (fromUnit === 'g' && toUnit === 'kg') return qty / 1000;
  if (fromUnit === 'l' && toUnit === 'ml') return qty * 1000;
  if (fromUnit === 'ml' && toUnit === 'l') return qty / 1000;
  return null;
};

/**
 * حساب سعر الوحدة المطلوبة من سعر شراء المنتج ووحدته.
 * @param {number} purchasePrice سعر الشراء
 * @param {string} productUnit وحدة المنتج
 * @param {string} wantedUnit الوحدة المطلوبة
 * @returns {number}
 */
export const unitPriceFor = (purchasePrice: number, productUnit: string, wantedUnit: string) => {
  const fromUnit = normalizeUnit(productUnit);
  const toUnit = normalizeUnit(wantedUnit);
  if (!fromUnit || !toUnit) return null;
  const converted = convertQty(1, fromUnit, toUnit);
  if (converted == null || converted === 0) return null;
  return Number(purchasePrice || 0) / converted;
};

/**
 * حساب تكلفة وصفة من مكوناتها.
 * @param {any[]} [items] مكونات الوصفة
 * @returns {number}
 */
export const calculateRecipeCost = (items: any[] = []) => {
  let totalCost = 0;
  for (const item of items) {
    const qty = Number(item.quantity || 0);
    if (!qty) continue;
    // prefer already-computed unit price (`ingredient_unit_price`) when available
    if (item.ingredient_unit_price != null) {
      totalCost += qty * Number(item.ingredient_unit_price || 0);
      continue;
    }
    const unitPrice = unitPriceFor(
      item.ingredient_purchase_price,
      item.ingredient_unit,
      item.unit_code,
    );
    if (unitPrice == null) continue;
    totalCost += qty * unitPrice;
  }
  return roundMoney(totalCost);
};

const normalizeId = (value) => Number(value);

/**
 * جلب تكلفة شراء المنتجات أو تكلفة وصفاتها من لقطة متسقة للبيانات.
 * @param {{ query: (text: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }> }} db اتصال قاعدة البيانات (Pool أو PoolClient)
 * @param {any[]} [productIds] معرفات المنتجات
 * @returns {Promise<Map<number, { cost: number, source: string }>>}
 */
export const getProductsEffectiveCosts = async (
  db: {
    query: (
      _text: string,
      _params?: unknown[],
    ) => Promise<{ rows: any[]; rowCount: number | null }>;
  },
  productIds: any[] = [],
) => {
  const ids = [
    ...new Set(
      productIds.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0 && id <= 2147483647),
    ),
  ];
  if (!ids.length) return new Map();

  const costs = new Map();
  // Prices and recipe quantities must share one database snapshot. A process-local
  // cost cache cannot observe edits committed by another local/cloud API process.
  const snapshot = await db.query(
    `WITH RECURSIVE cost_product_ids(id) AS (
       SELECT id FROM products WHERE id = ANY($1::int[]) AND deleted_at IS NULL
       UNION
       SELECT ri.ingredient_product_id FROM cost_product_ids cp
       JOIN product_recipes r ON r.product_id = cp.id AND r.deleted_at IS NULL AND r.is_active = TRUE
       JOIN product_recipe_items ri ON ri.recipe_id = r.id
     )
     SELECT
       COALESCE((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'purchase_price', p.purchase_price, 'unit', p.unit))
         FROM products p JOIN cost_product_ids cp ON cp.id = p.id WHERE p.deleted_at IS NULL), '[]'::jsonb) AS products,
       COALESCE((SELECT jsonb_agg(jsonb_build_object(
         'parent_product_id', r.product_id, 'ingredient_product_id', ri.ingredient_product_id,
         'quantity', ri.quantity, 'unit_code', ri.unit_code, 'ingredient_unit', ip.unit))
         FROM product_recipes r
         JOIN cost_product_ids cp ON cp.id = r.product_id
         JOIN product_recipe_items ri ON ri.recipe_id = r.id
         JOIN products ip ON ip.id = ri.ingredient_product_id
         WHERE r.deleted_at IS NULL AND r.is_active = TRUE), '[]'::jsonb) AS recipe_items`,
    [ids],
  );
  const data = snapshot.rows[0] || { products: [], recipe_items: [] };
  const productMap = new Map();
  for (const r of data.products) {
    productMap.set(Number(r.id), r);
  }

  const recipeMap = new Map();
  for (const item of data.recipe_items) {
    const parentId = Number(item.parent_product_id);
    if (!recipeMap.has(parentId)) {
      recipeMap.set(parentId, []);
    }
    recipeMap.get(parentId).push(item);
  }

  // Resolve shared ingredients once within this request.
  const resolvedCache = new Map();
  const stack = new Set();

  const resolveCostInMemory = (id) => {
    const normalizedIdVal = normalizeId(id);
    if (!normalizedIdVal) return { cost: 0, source: 'purchase_price' };
    if (resolvedCache.has(normalizedIdVal)) return resolvedCache.get(normalizedIdVal);

    let result;
    if (stack.has(normalizedIdVal)) {
      // Break circular dependency, fallback to base price
      const base = productMap.get(normalizedIdVal);
      result = { cost: roundMoney(base?.purchase_price || 0), source: 'purchase_price' };
    } else {
      stack.add(normalizedIdVal);
      try {
        const base = productMap.get(normalizedIdVal);
        if (!base) {
          result = { cost: 0, source: 'purchase_price' };
        } else {
          const purchasePrice = roundMoney(base.purchase_price || 0);
          const items = recipeMap.get(normalizedIdVal) || [];
          if (items.length === 0) {
            result = { cost: purchasePrice, source: 'purchase_price' };
          } else {
            let totalCost = 0;
            for (const item of items) {
              const ingId = Number(item.ingredient_product_id);
              const ingredient = resolveCostInMemory(ingId);
              const unitPrice = unitPriceFor(ingredient.cost, item.ingredient_unit, item.unit_code);
              if (unitPrice == null) continue;
              totalCost += Number(item.quantity || 0) * unitPrice;
            }

            totalCost = roundMoney(totalCost);
            if (totalCost <= 0 && purchasePrice > 0) {
              result = { cost: purchasePrice, source: 'purchase_price' };
            } else {
              result = { cost: totalCost, source: 'recipe' };
            }
          }
        }
      } finally {
        stack.delete(normalizedIdVal);
      }
    }

    resolvedCache.set(normalizedIdVal, result);
    return result;
  };

  // Reuse resolved ingredient costs within this snapshot only.
  for (const id of ids) {
    const result = resolveCostInMemory(id);
    costs.set(id, result);
  }

  return costs;
};

/**
 * جلب التكلفة الفعلية لمنتج واحد.
 * @param {{ query: (text: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }> }} db اتصال قاعدة البيانات (Pool أو PoolClient)
 * @param {number} productId معرف المنتج
 * @returns {Promise<{ cost: number, source: string }>}
 */
export const getProductEffectiveCost = async (
  db: {
    query: (
      _text: string,
      _params?: unknown[],
    ) => Promise<{ rows: any[]; rowCount: number | null }>;
  },
  productId: number,
) => {
  const costs = await getProductsEffectiveCosts(db, [productId]);
  return costs.get(Number(productId)) || { cost: 0, source: 'purchase_price' };
};

/**
 * استهلاك طبقات تكلفة المخزون (FIFO) عند البيع أو استهلاك الوصفات
 */
export const depleteInventoryCostLayers = async (
  client: import('pg').PoolClient,
  productId: number,
  warehouseId: number,
  quantityToDeplete: number,
) => {
  let remainingToDeplete = Number(quantityToDeplete);
  let totalCost = 0;
  if (remainingToDeplete <= 0) return { quantity: 0, cost: 0 };

  const layersRes = await client.query(
    `SELECT id, remaining_quantity, unit_cost
     FROM inventory_cost_layers
     WHERE product_id = $1 AND warehouse_id = $2 AND remaining_quantity > 0
     ORDER BY created_at ASC, id ASC
     FOR UPDATE`,
    [productId, warehouseId],
  );

  for (const layer of layersRes.rows) {
    if (remainingToDeplete <= 0.0001) break;
    const layerRemaining = Number(layer.remaining_quantity);
    const layerCost = Number(layer.unit_cost || 0);
    if (!Number.isFinite(layerCost) || layerCost < 0) {
      throw new AppError('طبقة تكلفة المخزون غير صالحة؛ يلزم مراجعتها قبل الصرف', 409);
    }
    const take = Math.min(layerRemaining, remainingToDeplete);
    await client.query(
      `UPDATE inventory_cost_layers
       SET remaining_quantity = remaining_quantity - $1
       WHERE id = $2`,
      [take, layer.id],
    );
    remainingToDeplete -= take;
    totalCost += take * layerCost;
  }
  return { quantity: Number(quantityToDeplete) - remainingToDeplete, cost: roundMoney(totalCost) };
};

/**
 * نقل أجزاء طبقات التكلفة إلى الوجهة داخل معاملة التحويل نفسها.
 */
export const transferInventoryCostLayers = async (
  client: import('pg').PoolClient,
  productId: number,
  fromWarehouseId: number,
  toProductId: number,
  toWarehouseId: number,
  quantity: number,
  destinationMovementId: number,
) => {
  let remainingUnits = Math.round(quantity * 1000);
  if (
    !Number.isSafeInteger(remainingUnits) ||
    remainingUnits <= 0 ||
    Math.abs(quantity * 1000 - remainingUnits) > 0.000001 ||
    (productId === toProductId && fromWarehouseId === toWarehouseId)
  ) {
    throw new AppError('كمية أو وجهة نقل التكلفة غير صالحة', 400);
  }
  let totalCost = 0;
  let estimatedQuantity = 0;
  const layers = await client.query(
    `SELECT id, remaining_quantity, unit_cost FROM inventory_cost_layers
    WHERE product_id = $1 AND warehouse_id = $2 AND remaining_quantity > 0
    ORDER BY created_at, id FOR UPDATE`,
    [productId, fromWarehouseId],
  );
  const addDestinationLayer = async (units: number, unitCost: number, estimated = false) => {
    if (!Number.isFinite(unitCost) || unitCost < 0)
      throw new AppError('تكلفة طبقة التحويل غير صالحة', 409);
    const transferredQuantity = units / 1000;
    const cost = transferredQuantity * unitCost;
    if (!Number.isFinite(cost)) throw new AppError('تكلفة التحويل تتجاوز الحد المقبول', 409);
    await client.query(
      `INSERT INTO inventory_cost_layers
      (product_id, warehouse_id, source_movement_id, source_type, quantity, remaining_quantity, unit_cost, total_cost)
      VALUES ($1, $2, $3, $4, $5, $5, $6, $7)`,
      [
        toProductId,
        toWarehouseId,
        destinationMovementId,
        estimated ? 'transfer_estimated' : 'transfer',
        transferredQuantity,
        unitCost,
        roundMoney(cost),
      ],
    );
    totalCost += cost;
  };
  for (const layer of layers.rows) {
    if (remainingUnits <= 0) break;
    const availableUnits = Math.round(Number(layer.remaining_quantity) * 1000);
    if (!Number.isSafeInteger(availableUnits) || availableUnits < 0)
      throw new AppError('كمية طبقة التحويل غير صالحة', 409);
    const take = Math.min(remainingUnits, availableUnits);
    if (!take) continue;
    await client.query(
      'UPDATE inventory_cost_layers SET remaining_quantity = remaining_quantity - $1 WHERE id = $2',
      [take / 1000, layer.id],
    );
    await addDestinationLayer(take, Number(layer.unit_cost));
    remainingUnits -= take;
  }
  if (remainingUnits > 0) {
    const product = await client.query('SELECT purchase_price FROM products WHERE id = $1', [
      productId,
    ]);
    const fallback = Number(product.rows[0]?.purchase_price);
    if (!Number.isFinite(fallback) || fallback < 0)
      throw new AppError('المخزون بلا طبقات أو تكلفة أصلية صالحة للتحويل', 409);
    estimatedQuantity = remainingUnits / 1000;
    await addDestinationLayer(remainingUnits, fallback, true);
  }
  return { cost: roundMoney(totalCost), estimatedQuantity };
};

/** استعادة طبقات تكلفة المخزون عند المرتجع. */
export const restoreInventoryCostLayers = async (
  client: import('pg').PoolClient,
  productId: number,
  warehouseId: number,
  quantityToRestore: number,
  unitCost: number = 0,
  sourceType: string = 'sale_return',
) => {
  const qty = Number(quantityToRestore);
  if (qty <= 0) return;

  await client.query(
    `INSERT INTO inventory_cost_layers (
      product_id, warehouse_id, source_type, quantity, remaining_quantity, unit_cost, total_cost
    ) VALUES ($1, $2, $3, $4, $4, $5, $6)`,
    [productId, warehouseId, sourceType, qty, unitCost, roundMoney(qty * unitCost)],
  );
};
