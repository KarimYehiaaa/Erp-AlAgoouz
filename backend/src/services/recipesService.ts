import { AppError } from '../types/errors.ts';
import { getClient, query } from '../database/pool.ts';
import {
  normalizeUnit,
  convertQty,
  depleteInventoryCostLayers,
  restoreInventoryCostLayers,
} from './productCostService.ts';
import * as inventoryService from './inventoryService.ts';
import { getDefaultWarehouseId, getWarehouseIdByCode } from './warehouseService.ts';
import { getAllowedWarehouses } from '../middleware/warehouseAccess.ts';
import { roundMoney } from '../utils/money.ts';

const WEIGHT_UNITS = new Set(['g', 'kg']);
const VOLUME_UNITS = new Set(['ml', 'l']);

const unitGroup = (u) =>
  WEIGHT_UNITS.has(u) ? 'weight' : VOLUME_UNITS.has(u) ? 'volume' : u === 'count' ? 'count' : null;

/**
 * تنفيذ استهلاك الوصفة عند البيع:
 * - يخصم المخزون من المكونات
 * - يسجل حركات stock_movements
 */
/**
 * استهلاك مكونات الوصفة عند بيع منتج مُصنّع.
 * @param {import('pg').PoolClient} client عميل المعاملة
 * @param {{ productId: number, soldQty: number, warehouseId: number, referenceType?: string, referenceId?: number | null, userId?: number }} args بيانات الاستهلاك
 * @returns {Promise<{ cost: number }>}
 */
export const consumeRecipeForSale = async (
  client: import('pg').PoolClient,
  {
    productId,
    soldQty,
    warehouseId,
    referenceType = 'sale',
    referenceId = null,
    userId,
    recipeId,
  }: {
    productId: number;
    soldQty: number;
    warehouseId: number;
    referenceType?: string;
    referenceId?: number | null;
    userId?: number;
    recipeId?: number;
  },
) => {
  const saleUnits = Math.round(Number(soldQty) * 1000);
  if (
    !Number.isSafeInteger(saleUnits) ||
    saleUnits <= 0 ||
    Number(soldQty) > 999999999.999 ||
    Math.abs(Number(soldQty) * 1000 - saleUnits) > 0.000001
  )
    throw new AppError('كمية بيع الوصفة غير صالحة أو تتجاوز ثلاث منازل', 400);
  const allowed = await getAllowedWarehouses(Number(userId), client);
  if (!allowed.includes(Number(warehouseId)))
    throw new AppError('مخزن بيع الوصفة خارج نطاق صلاحياتك', 403);
  // A sale consumes only its recorded warehouse, including for administrators.
  // Production batches retain their explicitly authorized ingredient sourcing.
  const sourceWarehouseIds = referenceType === 'sale' ? [Number(warehouseId)] : allowed;
  const warehouses = (
    await client.query(
      `SELECT id FROM warehouses WHERE deleted_at IS NULL
    AND is_active = TRUE AND id = ANY($1::int[]) ORDER BY id`,
      [sourceWarehouseIds],
    )
  ).rows.map((row) => Number(row.id));
  if (!warehouses.includes(Number(warehouseId))) throw new AppError('مخزن بيع الوصفة غير نشط', 409);
  const recipe = await client.query(
    `SELECT id FROM product_recipes WHERE product_id = $1
    AND deleted_at IS NULL AND is_active = TRUE AND ($2::int IS NULL OR id = $2) ORDER BY id LIMIT 1`,
    [productId, recipeId ?? null],
  );
  if (!recipe.rows[0])
    throw new AppError('وصفة المنتج لم تعد نشطة؛ أعد تحميل المنتج قبل البيع', 409);
  const items = (
    await client.query(
      `SELECT ri.*, p.name_ar AS ingredient_name, p.unit AS ingredient_unit,
    p.purchase_price, p.is_active AS ingredient_active, p.deleted_at AS ingredient_deleted_at
    FROM product_recipe_items ri JOIN products p ON p.id = ri.ingredient_product_id
    WHERE ri.recipe_id = $1 ORDER BY ri.ingredient_product_id, ri.id`,
      [recipe.rows[0].id],
    )
  ).rows;
  if (!items.length) throw new AppError('الوصفة لا تحتوي على مكونات؛ يلزم تصحيحها قبل البيع', 409);
  const requirements = new Map<number, { units: number; name: string; purchasePrice: number }>();
  for (const item of items) {
    if (!item.ingredient_active || item.ingredient_deleted_at)
      throw new AppError(`مكون الوصفة غير نشط: ${item.ingredient_name}`, 409);
    const recipeUnit = normalizeUnit(item.unit_code);
    const stockUnit = normalizeUnit(item.ingredient_unit);
    if (!recipeUnit || !stockUnit || unitGroup(recipeUnit) !== unitGroup(stockUnit))
      throw new AppError(`وحدة مكون الوصفة غير متوافقة: ${item.ingredient_name}`, 409);
    const needed = convertQty(Number(item.quantity) * Number(soldQty), recipeUnit, stockUnit);
    const units = Math.round(Number(needed) * 1000);
    if (
      needed == null ||
      !Number.isSafeInteger(units) ||
      units <= 0 ||
      Number(needed) > 999999999.999 ||
      Math.abs(Number(needed) * 1000 - units) > 0.000001
    )
      throw new AppError(
        `كمية المكون ${item.ingredient_name} بعد تحويل الوحدة تتجاوز دقة المخزون أو غير صالحة`,
        409,
      );
    const id = Number(item.ingredient_product_id);
    const existing = requirements.get(id);
    const combined = (existing?.units || 0) + units;
    if (!Number.isSafeInteger(combined) || combined > 999999999999)
      throw new AppError('إجمالي كمية المكون يتجاوز حد المخزون', 409);
    requirements.set(id, {
      units: combined,
      name: item.ingredient_name,
      purchasePrice: Number(item.purchase_price),
    });
  }
  const locked = new Map<string, any[]>();
  // ترتيب القفل مستقل عن أولوية صرف مخزن البيع لمنع اختلاف اتجاه الأقفال بين الوصفات.
  for (const productId of [...requirements.keys()].sort((a, b) => a - b)) {
    for (const targetWarehouse of warehouses) {
      await inventoryService.ensureInventoryRow(client, productId, targetWarehouse);
      const rows = (
        await client.query(
          'SELECT * FROM inventory WHERE product_id = $1 AND warehouse_id = $2 ORDER BY id FOR UPDATE',
          [productId, targetWarehouse],
        )
      ).rows;
      for (const row of rows) {
        row.units = Math.round(Number(row.quantity) * 1000);
        row.reservedUnits = Math.round(Number(row.reserved_quantity ?? 0) * 1000);
        if (
          !Number.isSafeInteger(row.units) ||
          row.units < 0 ||
          !Number.isSafeInteger(row.reservedUnits) ||
          row.reservedUnits < 0 ||
          row.reservedUnits > row.units
        )
          throw new AppError('رصيد دفعة مكون الوصفة أو المحجوز غير صالح', 409);
      }
      locked.set(`${productId}:${targetWarehouse}`, rows);
    }
  }
  const candidates = [
    Number(warehouseId),
    ...warehouses.filter((id) => id !== Number(warehouseId)),
  ];
  let totalCost = 0;
  for (const [ingredientId, requirement] of requirements) {
    let remainingUnits = requirement.units;
    for (const targetWarehouse of candidates) {
      let warehouseUnits = 0;
      for (const row of locked.get(`${ingredientId}:${targetWarehouse}`)!) {
        const take = Math.min(remainingUnits, row.units - row.reservedUnits);
        if (take > 0) {
          await client.query(
            'UPDATE inventory SET quantity = quantity - $1, updated_at = NOW() WHERE id = $2',
            [take / 1000, row.id],
          );
          row.units -= take;
          warehouseUnits += take;
          remainingUnits -= take;
        }
        if (!remainingUnits) break;
      }
      if (warehouseUnits > 0) {
        const quantity = warehouseUnits / 1000;
        const consumed = await depleteInventoryCostLayers(
          client,
          ingredientId,
          targetWarehouse,
          quantity,
        );
        const estimatedQuantity = Math.max(
          0,
          Math.round((quantity - consumed.quantity) * 1000) / 1000,
        );
        if (
          estimatedQuantity > 0 &&
          (!Number.isFinite(requirement.purchasePrice) || requirement.purchasePrice < 0)
        )
          throw new AppError('تكلفة مكون الوصفة بلا طبقات غير صالحة', 409);
        const cost = roundMoney(
          consumed.cost +
            (estimatedQuantity > 0 ? estimatedQuantity * requirement.purchasePrice : 0),
        );
        totalCost += cost;
        await client.query(
          `INSERT INTO stock_movements
          (product_id, from_warehouse_id, movement_type, quantity, reference_type, reference_id, user_id, notes, unit_cost, total_cost)
          VALUES ($1,$2,'consumption',$3,$4,$5,$6,$7,$8,$9)`,
          [
            ingredientId,
            targetWarehouse,
            quantity,
            referenceType,
            referenceId,
            userId,
            `استهلاك وصفة المنتج ${productId} (تكلفة مسجلة)${estimatedQuantity > 0 ? ` (تكلفة تقديرية لكمية ${estimatedQuantity})` : ''}`,
            cost / quantity,
            cost,
          ],
        );
      }
      if (!remainingUnits) break;
    }
    if (remainingUnits > 0)
      throw new AppError(
        `مخزون المكون غير كاف في المخازن المسموحة: ${requirement.name}؛ المطلوب ${requirement.units / 1000}`,
        409,
      );
  }
  return { cost: roundMoney(totalCost) };
};

/**
 * إعادة مكونات الوصفة للمخزون عند إرجاع بيع لمنتج مُصنّع.
 * @param {import('pg').PoolClient} client عميل المعاملة
 * @param {{ productId: number, soldQty: number, warehouseId: number, referenceType?: string, referenceId?: number | null, userId?: number }} args بيانات الإرجاع
 * @returns {Promise<void>}
 */
export const restoreRecipeForSale = async (
  client: import('pg').PoolClient,
  {
    productId,
    soldQty,
    warehouseId,
    referenceType = 'sale',
    referenceId = null,
    userId,
  }: {
    productId: number;
    soldQty: number;
    warehouseId: number;
    referenceType?: string;
    referenceId?: number | null;
    userId?: number;
  },
) => {
  const consumedRows = referenceId
    ? (
        await client.query(
          `SELECT product_id AS ingredient_product_id,
                from_warehouse_id,
                SUM(quantity) AS quantity
         FROM stock_movements
         WHERE reference_type = $1
           AND reference_id = $2
           AND movement_type = 'consumption'
         GROUP BY product_id, from_warehouse_id`,
          [referenceType, referenceId],
        )
      ).rows
    : [];

  if (consumedRows.length) {
    for (const item of consumedRows) {
      const qtyToRestore = Number(item.quantity || 0);
      if (qtyToRestore <= 0) continue;

      const restoreWarehouseId = item.from_warehouse_id || warehouseId;
      await inventoryService.ensureInventoryRow(
        client,
        item.ingredient_product_id,
        restoreWarehouseId,
      );
      await client.query(
        `UPDATE inventory SET quantity = quantity + $1, updated_at = NOW()
         WHERE product_id = $2 AND warehouse_id = $3`,
        [qtyToRestore, item.ingredient_product_id, restoreWarehouseId],
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
          `استرجاع مكونات مرتجع من حركة المنتج ${productId}`,
        ],
      );

      await restoreInventoryCostLayers(
        client,
        Number(item.ingredient_product_id),
        Number(restoreWarehouseId),
        qtyToRestore,
      );
    }
    return;
  }

  const recipeResult = await client.query(
    `SELECT r.id
     FROM product_recipes r
     WHERE r.product_id = $1 AND r.deleted_at IS NULL AND r.is_active = TRUE
     LIMIT 1`,
    [productId],
  );

  if (!recipeResult.rows[0]) return;

  const recipeId = recipeResult.rows[0].id;

  const itemsRes = await client.query(
    `SELECT ri.*, p.name_ar as ingredient_name, p.unit as ingredient_unit
     FROM product_recipe_items ri
     JOIN products p ON p.id = ri.ingredient_product_id
     WHERE ri.recipe_id = $1
     ORDER BY ri.sort_order, ri.id`,
    [recipeId],
  );

  for (const item of itemsRes.rows) {
    const recipeUnit = normalizeUnit(item.unit_code);
    const stockUnit = normalizeUnit(item.ingredient_unit);

    if (!recipeUnit || !stockUnit) {
      throw new AppError(`الوحدة غير مدعومة في مكون: ${item.ingredient_name}`);
    }

    if (unitGroup(recipeUnit) !== unitGroup(stockUnit)) {
      throw new AppError(
        `عدم توافق وحدة المكون ${item.ingredient_name}: الوصفة ${recipeUnit} والمخزون ${stockUnit}`,
      );
    }

    const rawQty = Number(item.quantity) * Number(soldQty);
    const qtyToRestore = convertQty(rawQty, recipeUnit, stockUnit);

    if (qtyToRestore == null) {
      throw new AppError(
        `تعذر تحويل وحدة المكون ${item.ingredient_name} من ${recipeUnit} إلى ${stockUnit}`,
      );
    }

    await inventoryService.ensureInventoryRow(client, item.ingredient_product_id, warehouseId);
    await client.query(
      `UPDATE inventory SET quantity = quantity + $1, updated_at = NOW()
       WHERE product_id = $2 AND warehouse_id = $3`,
      [qtyToRestore, item.ingredient_product_id, warehouseId],
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
        `استرجاع مكونات للوصفة من حركة ${referenceType} ${referenceId}`,
      ],
    );
  }
};

/**
 * استرجاع استهلاك الوصفات لمرجع محدد (بيع/إرجاع).
 * @param {import('pg').PoolClient} client عميل المعاملة
 * @param {{ referenceType?: string, referenceId: number, warehouseId: number, userId?: number }} args بيانات المرجع
 * @returns {Promise<void>}
 */
export const restoreRecipeConsumptionForReference = async (
  client: import('pg').PoolClient,
  {
    referenceType = 'sale',
    referenceId,
    warehouseId,
    userId,
  }: { referenceType?: string; referenceId: number; warehouseId: number; userId?: number },
) => {
  if (!referenceId) return false;

  const consumedRows = (
    await client.query(
      `SELECT product_id AS ingredient_product_id,
            from_warehouse_id,
            SUM(quantity) AS quantity
     FROM stock_movements
     WHERE reference_type = $1
       AND reference_id = $2
       AND movement_type = 'consumption'
     GROUP BY product_id, from_warehouse_id`,
      [referenceType, referenceId],
    )
  ).rows;

  if (!consumedRows.length) return false;

  for (const item of consumedRows) {
    const qtyToRestore = Number(item.quantity || 0);
    if (qtyToRestore <= 0) continue;

    const restoreWarehouseId = item.from_warehouse_id || warehouseId;
    await inventoryService.ensureInventoryRow(
      client,
      item.ingredient_product_id,
      restoreWarehouseId,
    );
    await client.query(
      `UPDATE inventory SET quantity = quantity + $1, updated_at = NOW()
       WHERE product_id = $2 AND warehouse_id = $3`,
      [qtyToRestore, item.ingredient_product_id, restoreWarehouseId],
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
      ],
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
/**
 * استرجاع استهلاك الوصفات لمنتج محدد.
 * @param {import('pg').PoolClient} client عميل المعاملة
 * @param {{ productId: number, soldQty: number, saleId: number, warehouseId: number, userId?: number }} args بيانات المنتج
 * @returns {Promise<void>}
 */
export const restoreRecipeConsumptionForProduct = async (
  client: import('pg').PoolClient,
  {
    productId,
    saleId,
    warehouseId,
    userId,
  }: {
    productId: number;
    soldQty: number;
    saleId: number;
    warehouseId: number;
    userId?: number;
  },
) => {
  const allowed = await getAllowedWarehouses(Number(userId), client);
  const match = `(sm.notes = 'استهلاك وصفة المنتج ' || $2::text
    OR sm.notes LIKE 'استهلاك وصفة المنتج ' || $2::text || ' %')`;
  const consumedRows = (
    await client.query(
      `SELECT array_agg(sm.id) AS movement_ids,
    sm.product_id AS ingredient_product_id, sm.from_warehouse_id,
    SUM(sm.quantity) AS quantity, SUM(COALESCE(sm.total_cost, 0)) AS recorded_cost,
    BOOL_AND(sm.notes LIKE '% (تكلفة مسجلة)%') AS has_recorded_cost,
    BOOL_OR(sm.notes LIKE '%تكلفة تقديرية%') AS has_estimated_cost
    FROM stock_movements sm WHERE sm.reference_type = 'sale' AND sm.reference_id = $1
      AND sm.movement_type = 'consumption' AND sm.voided_at IS NULL AND ${match}
    GROUP BY sm.product_id, sm.from_warehouse_id ORDER BY sm.product_id, sm.from_warehouse_id`,
      [saleId, productId],
    )
  ).rows;
  if (!consumedRows.length) {
    const previous = await client.query(
      `SELECT 1 FROM stock_movements sm WHERE sm.reference_type = 'sale'
      AND sm.reference_id = $1 AND sm.movement_type = 'consumption' AND ${match} LIMIT 1`,
      [saleId, productId],
    );
    if (previous.rows.length) return;
    throw new AppError(
      'لا توجد حركات استهلاك أصلية لهذه الوصفة؛ يلزم مراجعة البيع القديم قبل إرجاع مكوناته',
      409,
    );
  }
  for (const item of consumedRows) {
    const targetWarehouse = Number(item.from_warehouse_id || warehouseId);
    if (!allowed.includes(targetWarehouse))
      throw new AppError('مخزن مكونات البيع الأصلية خارج نطاق صلاحياتك', 403);
    const quantity = Number(item.quantity);
    const units = Math.round(quantity * 1000);
    if (
      !Number.isSafeInteger(units) ||
      units <= 0 ||
      Math.abs(quantity * 1000 - units) > 0.000001
    ) {
      throw new AppError('كمية استهلاك الوصفة الأصلية غير صالحة', 409);
    }
    let totalCost = Number(item.recorded_cost);
    if (!Number.isFinite(totalCost) || totalCost < 0)
      throw new AppError('تكلفة استهلاك الوصفة الأصلية غير صالحة', 409);
    const missingCost = totalCost === 0 && !item.has_recorded_cost;
    const estimated = missingCost || item.has_estimated_cost;
    if (missingCost) {
      const product = await client.query('SELECT purchase_price FROM products WHERE id = $1', [
        item.ingredient_product_id,
      ]);
      const unitCost = Number(product.rows[0]?.purchase_price);
      if (!Number.isFinite(unitCost) || unitCost < 0)
        throw new AppError('تكلفة مكون الوصفة التقديرية غير صالحة', 409);
      totalCost = quantity * unitCost;
    }
    totalCost = roundMoney(totalCost);
    await client.query(
      `INSERT INTO inventory (product_id, warehouse_id, quantity) VALUES ($1,$2,$3)
      ON CONFLICT (product_id, warehouse_id, COALESCE(batch_number, ''))
      DO UPDATE SET quantity = inventory.quantity + EXCLUDED.quantity, updated_at = NOW()`,
      [item.ingredient_product_id, targetWarehouse, quantity],
    );
    const movement = await client.query(
      `INSERT INTO stock_movements
      (product_id, to_warehouse_id, movement_type, quantity, reference_type, reference_id, user_id, notes, unit_cost, total_cost)
      VALUES ($1,$2,'return',$3,'sale',$4,$5,$6,$7,$8) RETURNING id`,
      [
        item.ingredient_product_id,
        targetWarehouse,
        quantity,
        saleId,
        userId,
        `استرداد مكونات وصفة المنتج ${productId} من بيع ${saleId}${missingCost ? ' (تكلفة تقديرية بسعر الشراء الحالي)' : estimated ? ' (تكلفة تقديرية مسجلة وقت الصرف)' : ''}`,
        totalCost / quantity,
        totalCost,
      ],
    );
    await client.query(
      `INSERT INTO inventory_cost_layers
      (product_id, warehouse_id, source_movement_id, source_type, quantity, remaining_quantity, unit_cost, total_cost)
      VALUES ($1,$2,$3,$4,$5,$5,$6,$7)`,
      [
        item.ingredient_product_id,
        targetWarehouse,
        movement.rows[0].id,
        estimated ? 'recipe_return_estimated' : 'recipe_return_recorded',
        quantity,
        totalCost / quantity,
        totalCost,
      ],
    );
    await client.query('UPDATE stock_movements SET voided_at = NOW() WHERE id = ANY($1::int[])', [
      item.movement_ids,
    ]);
  }
};

const resolveWarehouseId = async (client, warehouseId) => {
  const parsed = Number(warehouseId);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return getDefaultWarehouseId((sql, params) => client.query(sql, params));
};

/**
 * إنتاج دفعة وصفة (خصم المكونات وإضافة المنتج للمخزون).
 * @param {{ recipeId: number, quantity: number, warehouseId: number, notes?: string | null, mode?: string }} args بيانات الإنتاج
 * @param {number} userId معرف المستخدم المنفّذ
 * @returns {Promise<any>}
 */
export const produceRecipeBatch = async (
  {
    recipeId,
    quantity,
    warehouseId,
    notes = null,
    mode = 'production',
  }: {
    recipeId: number;
    quantity: number;
    warehouseId: number;
    notes?: string | null;
    mode?: string;
  },
  userId: number,
) => {
  const producedQty = Number(quantity);
  if (
    !Number.isFinite(producedQty) ||
    producedQty <= 0 ||
    producedQty > 999999999.999 ||
    Math.abs(producedQty * 1000 - Math.round(producedQty * 1000)) > 0.000001
  ) {
    throw new AppError('Production quantity must be greater than zero', 400);
  }
  const operationMode = mode === 'opening_production' ? 'opening_production' : 'production';

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const recipeRes = await client.query(
      `SELECT r.id, r.product_id, r.name_ar, p.name_ar AS product_name, p.unit AS product_unit, p.purchase_price, p.primary_warehouse_id
       FROM product_recipes r
       JOIN products p ON p.id = r.product_id
       WHERE r.id = $1
         AND r.deleted_at IS NULL
         AND r.is_active = TRUE AND p.is_active = TRUE AND p.deleted_at IS NULL
       LIMIT 1
       FOR UPDATE`,
      [recipeId],
    );
    const recipe = recipeRes.rows[0];
    if (!recipe) throw new AppError('Recipe not found or inactive', 404);

    const storeWarehouseId = await getWarehouseIdByCode('STORE', (sql, params) =>
      client.query(sql, params),
    );
    const primaryWarehouseId = Number(recipe.primary_warehouse_id || 0);
    let targetWarehouseId: number | null = null;
    if (warehouseId) {
      targetWarehouseId = await resolveWarehouseId(client, warehouseId);
    }
    if (!targetWarehouseId) {
      targetWarehouseId =
        primaryWarehouseId ||
        storeWarehouseId ||
        (await resolveWarehouseId(client, recipe.primary_warehouse_id));
    }
    if (!targetWarehouseId) throw new AppError('Warehouse is required', 400);

    const warehouseRes = await client.query(
      `SELECT id, name_ar FROM warehouses WHERE id = $1 AND deleted_at IS NULL AND is_active = TRUE`,
      [targetWarehouseId],
    );
    if (!warehouseRes.rows[0]) throw new AppError('Warehouse not found', 404);
    const targetWarehouseName = warehouseRes.rows[0].name_ar;

    const allowed = await getAllowedWarehouses(userId, client);
    if (!allowed.includes(Number(targetWarehouseId)))
      throw new AppError('مخزن الإنتاج خارج نطاق صلاحياتك', 403);
    const resolvedItems: any[] = [];
    await inventoryService.ensureInventoryRow(client, recipe.product_id, targetWarehouseId);
    await client.query(
      `UPDATE inventory SET quantity = quantity + $1, updated_at = NOW()
       WHERE product_id = $2 AND warehouse_id = $3 AND COALESCE(batch_number, '') = ''`,
      [producedQty, recipe.product_id, targetWarehouseId],
    );
    const prodMv = await client.query(
      `INSERT INTO stock_movements (
         product_id, to_warehouse_id, movement_type, quantity,
         reference_type, reference_id, user_id, notes
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [
        recipe.product_id,
        targetWarehouseId,
        operationMode,
        producedQty,
        operationMode,
        recipeId,
        userId,
        notes ||
          (operationMode === 'opening_production'
            ? `Opening production balance for ${recipe.product_name}`
            : `Production batch for ${recipe.product_name}`),
      ],
    );
    const prodMovementId = prodMv.rows[0].id;

    let productionCost: number;
    if (operationMode === 'production') {
      const consumed = await consumeRecipeForSale(client, {
        productId: recipe.product_id,
        soldQty: producedQty,
        warehouseId: targetWarehouseId,
        referenceType: 'production_batch',
        referenceId: prodMovementId,
        userId,
        recipeId,
      });
      productionCost = consumed.cost;
      const deductions = await client.query(
        `SELECT sm.product_id AS ingredient_product_id,
        p.name_ar AS ingredient_name, sm.from_warehouse_id AS warehouse_id, sm.quantity
        FROM stock_movements sm JOIN products p ON p.id=sm.product_id
        WHERE sm.reference_type='production_batch' AND sm.reference_id=$1 ORDER BY sm.id`,
        [prodMovementId],
      );
      resolvedItems.push(...deductions.rows);
    } else {
      const unitCost = Number(recipe.purchase_price);
      if (!Number.isFinite(unitCost) || unitCost < 0)
        throw new AppError('تكلفة الرصيد الافتتاحي غير صالحة', 409);
      productionCost = roundMoney(unitCost * producedQty);
    }
    await client.query('UPDATE stock_movements SET unit_cost=$1, total_cost=$2 WHERE id=$3', [
      productionCost / producedQty,
      productionCost,
      prodMovementId,
    ]);
    await client.query(
      `INSERT INTO inventory_cost_layers
      (product_id, warehouse_id, source_type, source_movement_id, quantity, remaining_quantity, unit_cost, total_cost)
      VALUES ($1,$2,$3,$4,$5,$5,$6,$7)`,
      [
        recipe.product_id,
        targetWarehouseId,
        operationMode,
        prodMovementId,
        producedQty,
        productionCost / producedQty,
        productionCost,
      ],
    );

    const stock = await client.query(
      `SELECT COALESCE(SUM(quantity),0) AS quantity FROM inventory WHERE product_id = $1 AND warehouse_id = $2`,
      [recipe.product_id, targetWarehouseId],
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
      ],
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
  } catch (e: any) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
};

/**
 * جلب كل عمليات الإنتاج مع تفاصيلها للعرض في الـ UI
 */
export const listProductionBatches = async (filters: Record<string, any>, userId: number) => {
  const allowed = await getAllowedWarehouses(userId);
  const params: any[] = [allowed];
  let idx = 2;
  let where = `sm.movement_type IN ('production','opening_production') AND sm.to_warehouse_id = ANY($1::int[])`;

  if (filters.recipe_id) {
    where += ` AND sm.reference_id = $${idx++}`;
    params.push(filters.recipe_id);
  }
  if (filters.from_date) {
    where += ` AND sm.created_at >= $${idx++}`;
    params.push(filters.from_date);
  }
  if (filters.to_date) {
    where += ` AND sm.created_at < ($${idx}::date + INTERVAL '1 day')`;
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
      (SELECT COALESCE(SUM(rev.quantity),0) >= sm.quantity FROM stock_movements rev
        WHERE rev.movement_type = 'adjustment'
          AND rev.reference_type = sm.movement_type
          AND rev.reference_id   = sm.id
      ) AS is_reversed,
      (SELECT COALESCE(SUM(rev.quantity),0) FROM stock_movements rev
        WHERE rev.movement_type='adjustment' AND rev.reference_type=sm.movement_type
          AND rev.reference_id=sm.id) AS reversed_quantity,
      -- مخزون المنتج الحالي في نفس المخزن
      COALESCE(inv.quantity, 0) AS current_stock
    FROM stock_movements sm
    JOIN products p  ON p.id  = sm.product_id
    LEFT JOIN product_recipes r ON r.id = sm.reference_id
    LEFT JOIN warehouses w ON w.id = sm.to_warehouse_id
    LEFT JOIN users u      ON u.id = sm.user_id
    LEFT JOIN LATERAL (SELECT SUM(quantity) AS quantity FROM inventory
      WHERE product_id = sm.product_id AND warehouse_id = sm.to_warehouse_id) inv ON TRUE
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
/**
 * عكس دفعة إنتاج (إعادة المكونات وخصم المنتج).
 * @param {number} movementId معرف حركة الإنتاج
 * @param {number} userId معرف المستخدم المنفّذ
 * @param {{ reverseQty?: number }} [opts] خيارات العكس (كمية جزئية اختيارية)
 * @returns {Promise<any>}
 */
export const reverseProductionBatch = async (
  movementId: number,
  userId: number,
  { reverseQty: rawReverseQty }: { reverseQty?: number } = {},
) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const mv = (
      await client.query('SELECT * FROM stock_movements WHERE id=$1 FOR UPDATE', [movementId])
    ).rows[0];
    if (!mv) throw new AppError('حركة الإنتاج غير موجودة', 404);
    if (!['production', 'opening_production'].includes(mv.movement_type))
      throw new AppError('الحركة ليست عملية إنتاج', 400);
    const allowed = await getAllowedWarehouses(userId, client);
    if (!allowed.includes(Number(mv.to_warehouse_id)))
      throw new AppError('مخزن الإنتاج خارج نطاق صلاحياتك', 403);
    const alreadyReversed = Number(
      (
        await client.query(
          `SELECT COALESCE(SUM(quantity),0) AS total FROM stock_movements
       WHERE movement_type='adjustment' AND reference_type=$1 AND reference_id=$2`,
          [mv.movement_type, mv.id],
        )
      ).rows[0].total,
    );
    const originalQty = Number(mv.quantity);
    const remaining = Math.round((originalQty - alreadyReversed) * 1000) / 1000;
    const reverseQty = rawReverseQty == null ? remaining : Number(rawReverseQty);
    if (
      !Number.isFinite(reverseQty) ||
      reverseQty <= 0 ||
      reverseQty > remaining ||
      Math.abs(reverseQty * 1000 - Math.round(reverseQty * 1000)) > 0.000001
    ) {
      throw new AppError('كمية العكس غير صالحة أو تتجاوز المتبقي أو دقة المخزون', 400);
    }
    const consumption = (
      await client.query(
        `SELECT * FROM stock_movements
      WHERE movement_type='consumption' AND reference_type='production_batch' AND reference_id=$1
      ORDER BY product_id, from_warehouse_id, id`,
        [mv.id],
      )
    ).rows;
    if (mv.movement_type === 'production' && !consumption.length) {
      throw new AppError(
        'لا توجد مكونات مرتبطة بدقة بهذه الدفعة؛ يلزم مطابقة البيانات التاريخية',
        409,
      );
    }
    const restoredIngredients: any[] = [];
    for (const cons of consumption) {
      if (!allowed.includes(Number(cons.from_warehouse_id)))
        throw new AppError('مصدر المكون خارج نطاق صلاحياتك', 403);
      const qty = (Number(cons.quantity) * reverseQty) / originalQty;
      const units = Math.round(qty * 1000);
      if (
        !Number.isSafeInteger(units) ||
        units <= 0 ||
        Math.abs(qty * 1000 - units) > 0.000001 ||
        cons.total_cost == null ||
        !Number.isFinite(Number(cons.total_cost)) ||
        Number(cons.total_cost) < 0
      ) {
        throw new AppError('كمية المكون أو تكلفته التاريخية لا تسمح بعكس آمن بهذه الكمية', 409);
      }
      const priorCost = Number(
        (
          await client.query(
            `SELECT COALESCE(SUM(total_cost),0) AS cost
        FROM stock_movements WHERE movement_type='return' AND reference_type=$1 AND reference_id=$2
          AND product_id=$3 AND to_warehouse_id=$4`,
            [mv.movement_type, mv.id, cons.product_id, cons.from_warehouse_id],
          )
        ).rows[0].cost,
      );
      // Cumulative rounding preserves cents across repeated partial reversals.
      const restoredCost = roundMoney(
        roundMoney((Number(cons.total_cost) * (alreadyReversed + reverseQty)) / originalQty) -
          priorCost,
      );
      if (restoredCost < 0)
        throw new AppError('تكلفة المرتجعات السابقة تحتاج مطابقة قبل العكس', 409);
      restoredIngredients.push({
        product_id: cons.product_id,
        warehouse_id: cons.from_warehouse_id,
        qty: units / 1000,
        cost: restoredCost,
      });
    }

    // Reverse only the unconsumed receipt of this production, not a different batch's cost.
    const layers = (
      await client.query(
        `SELECT * FROM inventory_cost_layers
      WHERE source_movement_id=$1 AND product_id=$2 AND warehouse_id=$3 ORDER BY id FOR UPDATE`,
        [mv.id, mv.product_id, mv.to_warehouse_id],
      )
    ).rows;
    if (
      !layers.length ||
      layers.reduce((sum, row) => sum + Number(row.remaining_quantity), 0) + 0.0000001 < reverseQty
    ) {
      throw new AppError(
        'دفعة الإنتاج استُهلكت أو لا توجد طبقة تكلفة مرتبطة بها؛ يلزم مراجعة الحركة',
        409,
      );
    }
    const rows = (
      await client.query(
        `SELECT * FROM inventory WHERE product_id=$1 AND warehouse_id=$2
      AND COALESCE(batch_number,'')='' ORDER BY id FOR UPDATE`,
        [mv.product_id, mv.to_warehouse_id],
      )
    ).rows;
    if (
      rows.some(
        (row) =>
          !Number.isFinite(Number(row.quantity)) ||
          Number(row.quantity) < 0 ||
          Number(row.reserved_quantity || 0) < 0 ||
          Number(row.reserved_quantity || 0) > Number(row.quantity),
      )
    ) {
      throw new AppError('رصيد دفعة الإنتاج أو المحجوز غير صالح', 409);
    }
    const available = rows.reduce(
      (sum, row) => sum + Number(row.quantity) - Number(row.reserved_quantity || 0),
      0,
    );
    if (available + 0.0000001 < reverseQty)
      throw new AppError('مخزون المنتج النهائي غير المحجوز غير كاف للعكس', 409);
    let units = Math.round(reverseQty * 1000);
    for (const row of rows) {
      const take = Math.min(
        units,
        Math.round((Number(row.quantity) - Number(row.reserved_quantity || 0)) * 1000),
      );
      if (take > 0)
        await client.query(
          'UPDATE inventory SET quantity=quantity-$1, updated_at=NOW() WHERE id=$2',
          [take / 1000, row.id],
        );
      units -= take;
      if (!units) break;
    }
    let layerQty = reverseQty;
    let reversedCost = 0;
    for (const layer of layers) {
      const take = Math.min(layerQty, Number(layer.remaining_quantity));
      if (take > 0) {
        await client.query(
          'UPDATE inventory_cost_layers SET remaining_quantity=remaining_quantity-$1 WHERE id=$2',
          [take, layer.id],
        );
        reversedCost += take * Number(layer.unit_cost);
        layerQty = Math.round((layerQty - take) * 1000) / 1000;
      }
      if (!layerQty) break;
    }
    if (
      mv.total_cost == null ||
      !Number.isFinite(Number(mv.total_cost)) ||
      Number(mv.total_cost) < 0
    ) {
      throw new AppError('تكلفة دفعة الإنتاج التاريخية غير مؤكدة', 409);
    }
    const priorReversedCost = Number(
      (
        await client.query(
          `SELECT COALESCE(SUM(total_cost),0) AS cost
      FROM stock_movements WHERE movement_type='adjustment' AND reference_type=$1 AND reference_id=$2`,
          [mv.movement_type, mv.id],
        )
      ).rows[0].cost,
    );
    reversedCost = roundMoney(
      roundMoney((Number(mv.total_cost) * (alreadyReversed + reverseQty)) / originalQty) -
        priorReversedCost,
    );
    await client.query(
      `INSERT INTO stock_movements
      (product_id, from_warehouse_id, movement_type, quantity, reference_type, reference_id, user_id, notes, unit_cost, total_cost)
      VALUES ($1,$2,'adjustment',$3,$4,$5,$6,$7,$8,$9)`,
      [
        mv.product_id,
        mv.to_warehouse_id,
        reverseQty,
        mv.movement_type,
        mv.id,
        userId,
        `عكس إنتاج id:${mv.id}`,
        reversedCost / reverseQty,
        roundMoney(reversedCost),
      ],
    );
    for (const restored of restoredIngredients) {
      await inventoryService.ensureInventoryRow(client, restored.product_id, restored.warehouse_id);
      await client.query(
        `UPDATE inventory SET quantity=quantity+$1, updated_at=NOW()
        WHERE product_id=$2 AND warehouse_id=$3 AND COALESCE(batch_number,'')=''`,
        [restored.qty, restored.product_id, restored.warehouse_id],
      );
      const receipt = (
        await client.query(
          `INSERT INTO stock_movements
        (product_id, to_warehouse_id, movement_type, quantity, reference_type, reference_id, user_id, notes, unit_cost, total_cost)
        VALUES ($1,$2,'return',$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
          [
            restored.product_id,
            restored.warehouse_id,
            restored.qty,
            mv.movement_type,
            mv.id,
            userId,
            `إعادة مكون عكس إنتاج id:${mv.id}`,
            restored.cost / restored.qty,
            restored.cost,
          ],
        )
      ).rows[0].id;
      await client.query(
        `INSERT INTO inventory_cost_layers
        (product_id,warehouse_id,source_type,source_movement_id,quantity,remaining_quantity,unit_cost,total_cost)
        VALUES ($1,$2,'production_return',$3,$4,$4,$5,$6)`,
        [
          restored.product_id,
          restored.warehouse_id,
          receipt,
          restored.qty,
          restored.cost / restored.qty,
          restored.cost,
        ],
      );
    }
    await client.query(
      `INSERT INTO activity_logs (user_id,module,action_ar,details) VALUES ($1,'recipes',$2,$3)`,
      [
        userId,
        'عكس دفعة إنتاج',
        JSON.stringify({
          movement_id: mv.id,
          reversed_qty: reverseQty,
          restored_ingredients: restoredIngredients,
        }),
      ],
    );
    const newStock = Number(
      (
        await client.query(
          'SELECT COALESCE(SUM(quantity),0) AS quantity FROM inventory WHERE product_id=$1 AND warehouse_id=$2',
          [mv.product_id, mv.to_warehouse_id],
        )
      ).rows[0].quantity,
    );
    await client.query('COMMIT');
    return {
      movement_id: mv.id,
      product_id: mv.product_id,
      warehouse_id: mv.to_warehouse_id,
      reversed_qty: reverseQty,
      new_stock: newStock,
      restored_ingredients: restoredIngredients,
      consumption_movements_found: consumption.length,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};
