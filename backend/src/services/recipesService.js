import { AppError } from '../middleware/errorHandler.js';
import { getClient, query } from '../database/pool.js';
import { UNIT_ALIASES, normalizeUnit, convertQty } from './productCostService.js';
import * as inventoryService from './inventoryService.js';
import { getDefaultWarehouseId, getWarehouseIdByCode } from './warehouseService.js';

const WEIGHT_UNITS = new Set(['g', 'kg']);
const VOLUME_UNITS = new Set(['ml', 'l']);

const unitGroup = (u) => (
  WEIGHT_UNITS.has(u) ? 'weight' : VOLUME_UNITS.has(u) ? 'volume' : u === 'count' ? 'count' : null
);

/**
 * *FAJ0 '3*GD'C 'DH5A) 9F/ 'D(J9:
 * - J.5E 'DE.2HF EF 'DECHF'*
 * - J3,D -1C'* stock_movements
 */
export const consumeRecipeForSale = async (
  client,
  { productId, soldQty, warehouseId, referenceType = 'sale', referenceId = null, userId }
) => {
  const recipeResult = await client.query(
    `SELECT r.id
     FROM product_recipes r
     WHERE r.product_id = $1 AND r.deleted_at IS NULL AND r.is_active = TRUE
     LIMIT 1`,
    [productId]
  );

  if (!recipeResult.rows[0]) return;

  const recipeId = recipeResult.rows[0].id;

  const itemsRes = await client.query(
    `SELECT ri.*, p.name_ar as ingredient_name, p.unit as ingredient_unit
     FROM product_recipe_items ri
     JOIN products p ON p.id = ri.ingredient_product_id
     WHERE ri.recipe_id = $1
     ORDER BY ri.sort_order, ri.id`,
    [recipeId]
  );

  const warehousesRes = await client.query(
    `SELECT id FROM warehouses WHERE deleted_at IS NULL AND is_active = TRUE ORDER BY id`
  );
  const warehouseCandidates = [
    warehouseId,
    ...warehousesRes.rows.map((w) => Number(w.id)).filter((id) => id && id !== warehouseId),
  ];

  for (const item of itemsRes.rows) {
    const recipeUnit = normalizeUnit(item.unit_code);
    const stockUnit = normalizeUnit(item.ingredient_unit);

    if (!recipeUnit || !stockUnit) {
      throw new AppError(`'DH-/) :J1 E/9HE) AJ ECHF: ${item.ingredient_name}`);
    }

    if (unitGroup(recipeUnit) !== unitGroup(stockUnit)) {
      throw new AppError(
        `9/E *H'AB H-/) 'DECHF ${item.ingredient_name}: 'DH5A) ${recipeUnit} H'DE.2HF ${stockUnit}`
      );
    }

    const rawNeeded = Number(item.quantity) * Number(soldQty);
    const needed = convertQty(rawNeeded, recipeUnit, stockUnit);

    if (needed == null) {
      throw new AppError(
        `*901 *-HJD H-/) 'DECHF ${item.ingredient_name} EF ${recipeUnit} %DI ${stockUnit}`
      );
    }

    const globalStockRes = await client.query(
       `SELECT COALESCE(SUM(quantity), 0) AS total FROM inventory WHERE product_id = $1`,
       [item.ingredient_product_id]
    );
    if (Number(globalStockRes.rows[0].total) < needed) {
       throw new AppError(`مخزون المكونات غير كافٍ عبر جميع المخازن للمكون: ${item.ingredient_name}. المطلوب: ${needed.toFixed(3)} ${stockUnit}`);
    }

    let remainingNeeded = needed;
    const resolvedDeductions = [];

    for (const candidateWarehouseId of warehouseCandidates) {
      if (remainingNeeded <= 0) break;
      const invRow = await inventoryService.lockInventoryRow(client, item.ingredient_product_id, candidateWarehouseId);
      const currentQty = Number(invRow?.quantity || 0);
      if (currentQty > 0) {
        const deductQty = Math.min(currentQty, remainingNeeded);
        remainingNeeded -= deductQty;
        resolvedDeductions.push({ warehouse_id: candidateWarehouseId, quantity: deductQty });
      }
    }

    if (remainingNeeded > 0.0001) {
       throw new AppError(`تعذر سحب الكمية من ${item.ingredient_name} بسبب تغير المخزون`);
    }

    for (const deduction of resolvedDeductions) {
      await client.query(
        `UPDATE inventory SET quantity = quantity - $1, updated_at = NOW()
         WHERE product_id = $2 AND warehouse_id = $3`,
        [deduction.quantity, item.ingredient_product_id, deduction.warehouse_id]
      );

      await client.query(
        `INSERT INTO stock_movements (
           product_id, from_warehouse_id, movement_type, quantity,
           reference_type, reference_id, user_id, notes
         ) VALUES ($1,$2,'consumption',$3,$4,$5,$6,$7)`,
        [
          item.ingredient_product_id,
          deduction.warehouse_id,
          deduction.quantity,
          referenceType,
          referenceId,
          userId,
          `'3*GD'C H5A) 'DEF*, ${productId}`,
        ]
      );
    }
  }
};

export const restoreRecipeForSale = async (
  client,
  { productId, soldQty, warehouseId, referenceType = 'sale', referenceId = null, userId }
) => {
  const consumedRows = referenceId
    ? (await client.query(
      `SELECT product_id AS ingredient_product_id,
                from_warehouse_id,
                SUM(quantity) AS quantity
         FROM stock_movements
         WHERE reference_type = $1
           AND reference_id = $2
           AND movement_type = 'consumption'
         GROUP BY product_id, from_warehouse_id`,
      [referenceType, referenceId]
    )).rows
    : [];

  if (consumedRows.length) {
    for (const item of consumedRows) {
      const qtyToRestore = Number(item.quantity || 0);
      if (qtyToRestore <= 0) continue;

      const restoreWarehouseId = item.from_warehouse_id || warehouseId;
      await inventoryService.ensureInventoryRow(client, item.ingredient_product_id, restoreWarehouseId);
      await client.query(
        `UPDATE inventory SET quantity = quantity + $1, updated_at = NOW()
         WHERE product_id = $2 AND warehouse_id = $3`,
        [qtyToRestore, item.ingredient_product_id, restoreWarehouseId]
      );

      await client.query(
        `INSERT INTO stock_movements (
           product_id, to_warehouse_id, movement_type, quantity,
           reference_type, reference_id, user_id, notes
         ) VALUES ($1,$2,'return',$3,$4,$5,$6,$7)`,
        [
          item.ingredient_product_id,
          restoreWarehouseId,
          qtyToRestore,
          referenceType,
          referenceId,
          userId,
          `'3*1,'9 ECHF'* E1,9) EF -1C) 'DEF*, ${productId}`,
        ]
      );
    }
    return;
  }

  const recipeResult = await client.query(
    `SELECT r.id
     FROM product_recipes r
     WHERE r.product_id = $1 AND r.deleted_at IS NULL AND r.is_active = TRUE
     LIMIT 1`,
    [productId]
  );

  if (!recipeResult.rows[0]) return;

  const recipeId = recipeResult.rows[0].id;

  const itemsRes = await client.query(
    `SELECT ri.*, p.name_ar as ingredient_name, p.unit as ingredient_unit
     FROM product_recipe_items ri
     JOIN products p ON p.id = ri.ingredient_product_id
     WHERE ri.recipe_id = $1
     ORDER BY ri.sort_order, ri.id`,
    [recipeId]
  );

  for (const item of itemsRes.rows) {
    const recipeUnit = normalizeUnit(item.unit_code);
    const stockUnit = normalizeUnit(item.ingredient_unit);

    if (!recipeUnit || !stockUnit) {
      throw new AppError(`'DH-/) :J1 E/9HE) AJ ECHF: ${item.ingredient_name}`);
    }

    if (unitGroup(recipeUnit) !== unitGroup(stockUnit)) {
      throw new AppError(
        `9/E *H'AB H-/) 'DECHF ${item.ingredient_name}: 'DH5A) ${recipeUnit} H'DE.2HF ${stockUnit}`
      );
    }

    const rawQty = Number(item.quantity) * Number(soldQty);
    const qtyToRestore = convertQty(rawQty, recipeUnit, stockUnit);

    if (qtyToRestore == null) {
      throw new AppError(
        `*901 *-HJD H-/) 'DECHF ${item.ingredient_name} EF ${recipeUnit} %DI ${stockUnit}`
      );
    }

    await inventoryService.ensureInventoryRow(client, item.ingredient_product_id, warehouseId);
    await client.query(
      `UPDATE inventory SET quantity = quantity + $1, updated_at = NOW()
       WHERE product_id = $2 AND warehouse_id = $3`,
      [qtyToRestore, item.ingredient_product_id, warehouseId]
    );

    await client.query(
      `INSERT INTO stock_movements (
         product_id, to_warehouse_id, movement_type, quantity,
         reference_type, reference_id, user_id, notes
       ) VALUES ($1,$2,'return',$3,$4,$5,$6,$7)`,
      [
        item.ingredient_product_id,
        warehouseId,
        qtyToRestore,
        referenceType,
        referenceId,
        userId,
        `'3*1,'9 ECHF'* DDH5A) EF -1C) ${referenceType} ${referenceId}`,
      ]
    );
  }
};

export const restoreRecipeConsumptionForReference = async (
  client,
  { referenceType = 'sale', referenceId, warehouseId, userId }
) => {
  if (!referenceId) return false;

  const consumedRows = (await client.query(
    `SELECT product_id AS ingredient_product_id,
            from_warehouse_id,
            SUM(quantity) AS quantity
     FROM stock_movements
     WHERE reference_type = $1
       AND reference_id = $2
       AND movement_type = 'consumption'
     GROUP BY product_id, from_warehouse_id`,
    [referenceType, referenceId]
  )).rows;

  if (!consumedRows.length) return false;

  for (const item of consumedRows) {
    const qtyToRestore = Number(item.quantity || 0);
    if (qtyToRestore <= 0) continue;

    const restoreWarehouseId = item.from_warehouse_id || warehouseId;
    await inventoryService.ensureInventoryRow(client, item.ingredient_product_id, restoreWarehouseId);
    await client.query(
      `UPDATE inventory SET quantity = quantity + $1, updated_at = NOW()
       WHERE product_id = $2 AND warehouse_id = $3`,
      [qtyToRestore, item.ingredient_product_id, restoreWarehouseId]
    );

    await client.query(
      `INSERT INTO stock_movements (
         product_id, to_warehouse_id, movement_type, quantity,
         reference_type, reference_id, user_id, notes
       ) VALUES ($1,$2,'return',$3,$4,$5,$6,$7)`,
      [
        item.ingredient_product_id,
        restoreWarehouseId,
        qtyToRestore,
        referenceType,
        referenceId,
        userId,
        `استرجاع مكونات مبيعة من حركة ${referenceType} ${referenceId}`,
      ]
    );
  }

  return true;
};

/**
 * استعادة مكونات وصفة منتج واحد بالذات عند المرتجع.
 * يبحث عن consumption movements الخاصة بهذا المنتج في هذه الفاتورة،
 * فلو لقاها يستعيدها، وإلا يحسب من الوصفة الحالية.
 *
 * الإصلاح: بدل restoreRecipeConsumptionForReference اللي كانت تستعيد
 * كل الـ consumptions في الـ reference دفعة واحدة (مما يتسبب في skip
 * منتجات لم يتم استعادتها فعلاً).
 */
export const restoreRecipeConsumptionForProduct = async (
  client,
  { productId, soldQty, saleId, warehouseId, userId }
) => {
  // ابحث عن consumption movements لهذا المنتج في هذه العملية
  const consumedRows = (await client.query(
    `SELECT sm.product_id AS ingredient_product_id,
            sm.from_warehouse_id,
            SUM(sm.quantity) AS quantity
     FROM stock_movements sm
     WHERE sm.reference_type = 'sale'
       AND sm.reference_id = $1
       AND sm.movement_type = 'consumption'
       AND EXISTS (
         SELECT 1 FROM product_recipe_items pri
         JOIN product_recipes pr ON pr.id = pri.recipe_id
         WHERE pr.product_id = $2
           AND pr.deleted_at IS NULL
           AND pri.ingredient_product_id = sm.product_id
       )
     GROUP BY sm.product_id, sm.from_warehouse_id`,
    [saleId, productId]
  )).rows;

  if (consumedRows.length) {
    // استعادة من سجلات الـ consumption الفعلية
    for (const item of consumedRows) {
      const qtyToRestore = Number(item.quantity || 0);
      if (qtyToRestore <= 0) continue;

      const restoreWarehouse = item.from_warehouse_id || warehouseId;
      await inventoryService.ensureInventoryRow(client, item.ingredient_product_id, restoreWarehouse);
      await client.query(
        `UPDATE inventory SET quantity = quantity + $1, updated_at = NOW()
         WHERE product_id = $2 AND warehouse_id = $3`,
        [qtyToRestore, item.ingredient_product_id, restoreWarehouse]
      );
      await client.query(
        `INSERT INTO stock_movements (
           product_id, to_warehouse_id, movement_type, quantity,
           reference_type, reference_id, user_id, notes
         ) VALUES ($1,$2,'return',$3,'sale',$4,$5,$6)`,
        [
          item.ingredient_product_id,
          restoreWarehouse,
          qtyToRestore,
          saleId,
          userId,
          `استرداد مكونات وصفة المنتج ${productId} من بيع ${saleId}`,
        ]
      );
    }
    return;
  }

  // fallback: احسب من الوصفة الحالية
  const recipeResult = await client.query(
    `SELECT r.id FROM product_recipes r
     WHERE r.product_id = $1 AND r.deleted_at IS NULL AND r.is_active = TRUE LIMIT 1`,
    [productId]
  );
  if (!recipeResult.rows[0]) return;

  const recipeId = recipeResult.rows[0].id;
  const itemsRes = await client.query(
    `SELECT ri.*, p.name_ar as ingredient_name, p.unit as ingredient_unit
     FROM product_recipe_items ri
     JOIN products p ON p.id = ri.ingredient_product_id
     WHERE ri.recipe_id = $1
     ORDER BY ri.sort_order, ri.id`,
    [recipeId]
  );

  for (const item of itemsRes.rows) {
    const recipeUnit = normalizeUnit(item.unit_code);
    const stockUnit = normalizeUnit(item.ingredient_unit);
    if (!recipeUnit || !stockUnit) continue;

    const rawQty = Number(item.quantity) * Number(soldQty);
    const qtyToRestore = convertQty(rawQty, recipeUnit, stockUnit);
    if (!qtyToRestore) continue;

    await inventoryService.ensureInventoryRow(client, item.ingredient_product_id, warehouseId);
    await client.query(
      `UPDATE inventory SET quantity = quantity + $1, updated_at = NOW()
       WHERE product_id = $2 AND warehouse_id = $3`,
      [qtyToRestore, item.ingredient_product_id, warehouseId]
    );
    await client.query(
      `INSERT INTO stock_movements (
         product_id, to_warehouse_id, movement_type, quantity,
         reference_type, reference_id, user_id, notes
       ) VALUES ($1,$2,'return',$3,'sale',$4,$5,$6)`,
      [
        item.ingredient_product_id,
        warehouseId,
        qtyToRestore,
        saleId,
        userId,
        `استرداد مكونات وصفة (fallback) للمنتج ${productId}`,
      ]
    );
  }
};

const resolveWarehouseId = async (client, warehouseId) => {
  const parsed = Number(warehouseId);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return getDefaultWarehouseId((sql, params) => client.query(sql, params));
};

export const produceRecipeBatch = async ({ recipeId, quantity, warehouseId, notes = null, mode = 'production' }, userId) => {
  const producedQty = Number(quantity);
  if (!Number.isFinite(producedQty) || producedQty <= 0) {
    throw new AppError('Production quantity must be greater than zero', 400);
  }
  const operationMode = mode === 'opening_production' ? 'opening_production' : 'production';

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const recipeRes = await client.query(
      `SELECT r.id, r.product_id, r.name_ar, p.name_ar AS product_name, p.unit AS product_unit, p.primary_warehouse_id
       FROM product_recipes r
       JOIN products p ON p.id = r.product_id
       WHERE r.id = $1
         AND r.deleted_at IS NULL
         AND r.is_active = TRUE
       LIMIT 1
       FOR UPDATE`,
      [recipeId]
    );
    const recipe = recipeRes.rows[0];
    if (!recipe) throw new AppError('Recipe not found or inactive', 404);

    const storeWarehouseId = await getWarehouseIdByCode('STORE', (sql, params) => client.query(sql, params));
    const primaryWarehouseId = Number(recipe.primary_warehouse_id || 0);
    let targetWarehouseId = primaryWarehouseId || null;
    if (!targetWarehouseId && warehouseId) {
      targetWarehouseId = await resolveWarehouseId(client, warehouseId);
    } else if (!targetWarehouseId) {
      targetWarehouseId = storeWarehouseId || await resolveWarehouseId(client, recipe.primary_warehouse_id);
    }
    if (!targetWarehouseId) throw new AppError('Warehouse is required', 400);

    const warehouseRes = await client.query(
      `SELECT id, name_ar FROM warehouses WHERE id = $1 AND deleted_at IS NULL AND is_active = TRUE`,
      [targetWarehouseId]
    );
    if (!warehouseRes.rows[0]) throw new AppError('Warehouse not found', 404);
    let targetWarehouseName = warehouseRes.rows[0].name_ar;

    const warehousesRes = await client.query(
      `SELECT id, name_ar
       FROM warehouses
       WHERE deleted_at IS NULL AND is_active = TRUE
       ORDER BY id`
    );

    const resolvedItems = [];
    if (operationMode === 'production') {
      const itemsRes = await client.query(
        `SELECT ri.*, p.name_ar AS ingredient_name, p.unit AS ingredient_unit
         FROM product_recipe_items ri
         JOIN products p ON p.id = ri.ingredient_product_id
         WHERE ri.recipe_id = $1
         ORDER BY ri.sort_order, ri.id`,
        [recipeId]
      );
      if (!itemsRes.rows.length) throw new AppError('Recipe has no ingredients', 400);

      const requirements = [];
      for (const item of itemsRes.rows) {
        const recipeUnit = normalizeUnit(item.unit_code);
        const stockUnit = normalizeUnit(item.ingredient_unit);
        if (!recipeUnit || !stockUnit) {
          throw new AppError(`Unable to resolve ingredient unit: ${item.ingredient_name}`, 400);
        }
        if (unitGroup(recipeUnit) !== unitGroup(stockUnit)) {
          throw new AppError(`Ingredient unit mismatch: ${item.ingredient_name}`, 400);
        }

        const needed = convertQty(Number(item.quantity) * producedQty, recipeUnit, stockUnit);
        if (needed == null) {
          throw new AppError(`Unable to convert ingredient quantity: ${item.ingredient_name}`, 400);
        }

        requirements.push({
          ingredient_product_id: item.ingredient_product_id,
          ingredient_name: item.ingredient_name,
          quantity: needed,
        });
      }

      const warehouseCandidates = [
        targetWarehouseId,
        ...warehousesRes.rows.map((w) => Number(w.id)).filter((id) => id && id !== targetWarehouseId),
      ];

      // 1. Pre-check global stock for all ingredients
      const globalStockRows = await client.query(
        `SELECT product_id, COALESCE(SUM(quantity), 0) AS total_quantity
         FROM inventory
         WHERE product_id = ANY($1::int[])
         GROUP BY product_id`,
        [requirements.map((r) => r.ingredient_product_id)]
      );
      const globalStockMap = new Map(globalStockRows.rows.map((row) => [Number(row.product_id), Number(row.total_quantity || 0)]));
      
      for (const req of requirements) {
        if (Number(globalStockMap.get(req.ingredient_product_id) || 0) < Number(req.quantity || 0)) {
           throw new AppError(`مخزون المكونات غير كافٍ عبر جميع المخازن. المكون: ${req.ingredient_name}. المطلوب: ${req.quantity}`, 400);
        }
      }

      // 2. Deduct incrementally from warehouses based on priority
      const resolvedDeductions = []; // { product_id, warehouse_id, quantity }
      
      for (const req of requirements) {
        let remainingNeeded = Number(req.quantity);
        
        for (const candidateWarehouseId of warehouseCandidates) {
          if (remainingNeeded <= 0) break;
          
          const invRow = await inventoryService.lockInventoryRow(client, req.ingredient_product_id, candidateWarehouseId);
          const currentQty = Number(invRow?.quantity || 0);
          
          if (currentQty > 0) {
            const deductQty = Math.min(currentQty, remainingNeeded);
            remainingNeeded -= deductQty;
            
            resolvedDeductions.push({
              ingredient_product_id: req.ingredient_product_id,
              ingredient_name: req.ingredient_name,
              warehouse_id: candidateWarehouseId,
              quantity: deductQty,
            });
          }
        }
        
        if (remainingNeeded > 0.0001) {
           throw new AppError(`تعذر سحب الكمية المطلوبة بالكامل من المكون: ${req.ingredient_name} بسبب تغير المخزون بشكل متزامن.`, 400);
        }
      }

      // 3. Apply the deductions
      for (const deduction of resolvedDeductions) {
        await client.query(
          `UPDATE inventory SET quantity = quantity - $1, updated_at = NOW()
           WHERE product_id = $2 AND warehouse_id = $3`,
          [deduction.quantity, deduction.ingredient_product_id, deduction.warehouse_id]
        );
        await client.query(
          `INSERT INTO stock_movements (
             product_id, from_warehouse_id, movement_type, quantity,
             reference_type, reference_id, user_id, notes
           ) VALUES ($1,$2,'consumption',$3,$4,$5,$6,$7)`,
          [
            deduction.ingredient_product_id,
            deduction.warehouse_id,
            deduction.quantity,
            'production',
            recipeId,
            userId,
            `Production ingredient consumption for ${recipe.product_name}`,
          ]
        );
        resolvedItems.push(deduction);
      }
    }

    await inventoryService.ensureInventoryRow(client, recipe.product_id, targetWarehouseId);
    await client.query(
      `UPDATE inventory SET quantity = quantity + $1, updated_at = NOW()
       WHERE product_id = $2 AND warehouse_id = $3`,
      [producedQty, recipe.product_id, targetWarehouseId]
    );
    await client.query(
      `INSERT INTO stock_movements (
         product_id, to_warehouse_id, movement_type, quantity,
         reference_type, reference_id, user_id, notes
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        recipe.product_id,
        targetWarehouseId,
        operationMode,
        producedQty,
        operationMode,
        recipeId,
        userId,
        notes || (operationMode === 'opening_production'
          ? `Opening production balance for ${recipe.product_name}`
          : `Production batch for ${recipe.product_name}`),
      ]
    );

    const stock = await client.query(
      `SELECT quantity FROM inventory WHERE product_id = $1 AND warehouse_id = $2`,
      [recipe.product_id, targetWarehouseId]
    );

    await client.query(
      `INSERT INTO activity_logs (user_id, module, action_ar, details)
       VALUES ($1, 'recipes', $2, $3)`,
      [
        userId,
        operationMode === 'opening_production'
          ? `Opening production balance ${producedQty} for ${recipe.product_name}`
          : `Produced ${producedQty} of ${recipe.product_name}`,
        JSON.stringify({
          recipe_id: recipeId,
          product_id: recipe.product_id,
          product_name: recipe.product_name,
          warehouse_id: targetWarehouseId,
          quantity: producedQty,
          mode: operationMode,
          new_stock: stock.rows[0]?.quantity || 0,
          items: resolvedItems,
        }),
      ]
    );

    await client.query('COMMIT');
    return {
      recipe_id: recipeId,
      product_id: recipe.product_id,
      product_name: recipe.product_name,
      warehouse_id: targetWarehouseId,
      warehouse_name: targetWarehouseName,
      quantity: producedQty,
      mode: operationMode,
      new_quantity: Number(stock.rows[0]?.quantity || 0),
      items: resolvedItems,
    };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
};

/**
 * جلب كل عمليات الإنتاج مع تفاصيلها للعرض في الـ UI
 */
export const listProductionBatches = async (filters = {}) => {
  const params = [];
  let idx = 1;
  let where = `sm.movement_type IN ('production','opening_production')`;

  if (filters.recipe_id) {
    where += ` AND sm.reference_id = $${idx++}`;
    params.push(filters.recipe_id);
  }
  if (filters.from_date) {
    where += ` AND sm.created_at >= $${idx++}`;
    params.push(filters.from_date);
  }
  if (filters.to_date) {
    where += ` AND sm.created_at < ($${idx++}::date + INTERVAL '1 day')`;
    params.push(filters.to_date);
  }

  const sql = `
    SELECT
      sm.id          AS movement_id,
      sm.product_id,
      p.name_ar      AS product_name,
      sm.reference_id AS recipe_id,
      r.name_ar      AS recipe_name,
      sm.movement_type,
      sm.quantity,
      sm.to_warehouse_id AS warehouse_id,
      w.name_ar      AS warehouse_name,
      sm.notes,
      sm.created_at,
      u.full_name    AS created_by,
      -- هل تم عكسها بالفعل؟ (يوجد adjustment بنفس reference)
      EXISTS (
        SELECT 1 FROM stock_movements rev
        WHERE rev.movement_type = 'adjustment'
          AND rev.reference_type = sm.movement_type
          AND rev.reference_id   = sm.id
      ) AS is_reversed,
      -- مخزون المنتج الحالي في نفس المخزن
      COALESCE(inv.quantity, 0) AS current_stock
    FROM stock_movements sm
    JOIN products p  ON p.id  = sm.product_id
    LEFT JOIN product_recipes r ON r.id = sm.reference_id
    LEFT JOIN warehouses w ON w.id = sm.to_warehouse_id
    LEFT JOIN users u      ON u.id = sm.user_id
    LEFT JOIN inventory inv ON inv.product_id  = sm.product_id
                            AND inv.warehouse_id = sm.to_warehouse_id
    WHERE ${where}
    ORDER BY sm.created_at DESC
    LIMIT 200
  `;

  return (await query(sql, params)).rows;
};

/**
 * عكس عملية إنتاج — يطرح المنتج النهائي ويُعيد المكونات
 *
 * @param {number} movementId  - id حركة الإنتاج في stock_movements
 * @param {number} userId
 * @param {object} options
 * @param {number} [options.reverseQty]  - كمية جزئية للعكس (اختياري، الافتراضي: الكمية الكاملة)
 */
export const reverseProductionBatch = async (movementId, userId, { reverseQty: rawReverseQty } = {}) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    // 1) جلب حركة الإنتاج مع lock
    const mvRes = await client.query(
      `SELECT * FROM stock_movements WHERE id = $1 FOR UPDATE`,
      [movementId]
    );
    if (!mvRes.rowCount) throw new AppError('حركة الإنتاج غير موجودة', 404);
    const mv = mvRes.rows[0];

    if (!['production', 'opening_production'].includes(mv.movement_type)) {
      throw new AppError(`هذه الحركة ليست عملية إنتاج (النوع: ${mv.movement_type})`, 400);
    }

    // 2) تحقق إن مش اتعكست قبل كده
    const alreadyReversed = await client.query(
      `SELECT 1 FROM stock_movements
       WHERE movement_type = 'adjustment'
         AND reference_type = $1
         AND reference_id   = $2
       LIMIT 1`,
      [mv.movement_type, mv.id]
    );
    if (alreadyReversed.rowCount) {
      throw new AppError('هذه العملية تم عكسها مسبقاً', 400);
    }

    const originalQty = Number(mv.quantity);
    const reverseQty = rawReverseQty ? Math.min(Number(rawReverseQty), originalQty) : originalQty;
    if (reverseQty <= 0) throw new AppError('الكمية يجب أن تكون أكبر من صفر', 400);

    const productId = mv.product_id;
    const warehouseId = mv.to_warehouse_id;
    const refType = mv.movement_type;   // 'production' | 'opening_production'
    const recipeId = mv.reference_id;

    // 3) تحقق من توفر المنتج النهائي في المخزن
    const invRow = await inventoryService.lockInventoryRow(client, productId, warehouseId);
    const currentStock = Number(invRow?.quantity || 0);
    if (currentStock < reverseQty) {
      throw new AppError(
        `مخزون المنتج النهائي غير كافٍ للعكس — متاح: ${currentStock}، مطلوب: ${reverseQty}`,
        400
      );
    }

    const proportionalFactor = reverseQty / originalQty;

    // 4) جلب حركات الـ consumption المرتبطة بهذه الدفعة (±2 دقيقة)
    const window = 2 * 60 * 1000;
    const dupTime = new Date(mv.created_at).getTime();
    const startTime = new Date(dupTime - window).toISOString();
    const endTime = new Date(dupTime + window).toISOString();

    const consRes = await client.query(
      `SELECT * FROM stock_movements
       WHERE movement_type = 'consumption'
         AND reference_type = $1
         AND reference_id   = $2
         AND created_at BETWEEN $3 AND $4
       ORDER BY id`,
      [refType, recipeId, startTime, endTime]
    );

    // 5) طرح المنتج النهائي من المخزون
    await client.query(
      `UPDATE inventory SET quantity = quantity - $1, updated_at = NOW()
       WHERE product_id = $2 AND warehouse_id = $3`,
      [reverseQty, productId, warehouseId]
    );

    // 6) تسجيل حركة عكس بـ adjustment (موجبة، from_warehouse = مخزن الإنتاج)
    await client.query(
      `INSERT INTO stock_movements
         (product_id, from_warehouse_id, movement_type, quantity,
          reference_type, reference_id, user_id, notes, created_at)
       VALUES ($1, $2, 'adjustment', $3, $4, $5, $6, $7, NOW())`,
      [
        productId,
        warehouseId,
        reverseQty,
        refType,
        mv.id,   // reference_id = id حركة الإنتاج الأصلية
        userId,
        `عكس عملية إنتاج — الحركة id:${mv.id}`,
      ]
    );

    // 7) إعادة المكونات إلى المخزون
    const restoredIngredients = [];
    for (const cons of consRes.rows) {
      const restoreQty = Number((Number(cons.quantity) * proportionalFactor).toFixed(6));
      if (restoreQty <= 0) continue;

      const fromWh = cons.from_warehouse_id;
      await inventoryService.ensureInventoryRow(client, cons.product_id, fromWh);
      await client.query(
        `UPDATE inventory SET quantity = quantity + $1, updated_at = NOW()
         WHERE product_id = $2 AND warehouse_id = $3`,
        [restoreQty, cons.product_id, fromWh]
      );
      await client.query(
        `INSERT INTO stock_movements
           (product_id, to_warehouse_id, movement_type, quantity,
            reference_type, reference_id, user_id, notes, created_at)
         VALUES ($1, $2, 'return', $3, $4, $5, $6, $7, NOW())`,
        [
          cons.product_id,
          fromWh,
          restoreQty,
          refType,
          mv.id,
          userId,
          `إعادة مكون — عكس إنتاج id:${mv.id}`,
        ]
      );
      restoredIngredients.push({ product_id: cons.product_id, warehouse_id: fromWh, qty: restoreQty });
    }

    // 8) تسجيل في activity_logs
    await client.query(
      `INSERT INTO activity_logs (user_id, module, action_ar, details)
       VALUES ($1, 'recipes', $2, $3)`,
      [
        userId,
        `عكس عملية إنتاج — المنتج ${productId} — كمية ${reverseQty}`,
        JSON.stringify({
          movement_id: mv.id,
          product_id: productId,
          recipe_id: recipeId,
          warehouse_id: warehouseId,
          reversed_qty: reverseQty,
          restored_ingredients: restoredIngredients,
        }),
      ]
    );

    await client.query('COMMIT');

    // المخزون الجديد بعد العكس
    const newStock = await client.query(
      `SELECT quantity FROM inventory WHERE product_id = $1 AND warehouse_id = $2`,
      [productId, warehouseId]
    );

    return {
      movement_id: mv.id,
      product_id: productId,
      warehouse_id: warehouseId,
      reversed_qty: reverseQty,
      new_stock: Number(newStock.rows[0]?.quantity || 0),
      restored_ingredients: restoredIngredients,
      consumption_movements_found: consRes.rowCount,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};
