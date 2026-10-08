import { getClient, query } from '../database/pool.ts';
import { AppError } from '../types/errors.ts';
import { toNumber, sanitizeLimit, roundMoney } from '../utils/money.ts';
import { transferInventoryCostLayers, depleteInventoryCostLayers } from './productCostService.ts';
import { getAllowedWarehouses } from '../middleware/warehouseAccess.ts';
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
const ADJUSTMENT_MOVEMENT_TYPES = new Set(['adjustment', 'wastage']);
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
const getInventory = async (warehouseId: number | undefined, userId: number) => {
  const allowed = await getAllowedWarehouses(userId);
  if (!allowed.length || (warehouseId != null && !allowed.includes(Number(warehouseId)))) {
    throw new AppError('لا تملك صلاحية قراءة المخزن المطلوب', 403);
  }
  return await inventoryRepository.getInventoryList(warehouseId, allowed);
};
/**
 * حركات المخزون مع فلترة (product_id, movement_type, limit...).
 * @param {Record<string, any>} [filters] خيارات الفلترة
 * @returns {Promise<any[]>}
 */
const getStockMovements = async (filters: Record<string, any>, userId: number) => {
  const allowed = await getAllowedWarehouses(userId);
  if (
    !allowed.length ||
    (filters.warehouse_id != null && !allowed.includes(Number(filters.warehouse_id)))
  ) {
    throw new AppError('لا تملك صلاحية قراءة حركات المخزن المطلوب', 403);
  }
  return await inventoryRepository.getStockMovements(filters, allowed);
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
    if (![from_warehouse_id, to_warehouse_id].every((id) => Number.isSafeInteger(id) && id > 0)) {
      throw new AppError('المخزن المصدر والوجهة مطلوبان بمعرف صحيح', 400);
    }
    const allowed = await getAllowedWarehouses(userId, client);
    if (![from_warehouse_id, to_warehouse_id].every((id) => allowed.includes(id))) {
      throw new AppError('لا تملك صلاحية التحويل بين المخازن المحددة', 403);
    }
    const rawItems = Array.isArray(data.items) && data.items.length > 0 ? data.items : [data];
    if (rawItems.length > 500) throw new AppError('الحد الأقصى للتحويل 500 بند', 400);
    const items = rawItems.map((item) => {
      const productId = Number(item.product_id);
      const toProductId = item.to_product_id == null ? productId : Number(item.to_product_id);
      const quantity = Number(item.quantity);
      const units = Math.round(quantity * 1000);
      if (
        ![productId, toProductId].every((id) => Number.isSafeInteger(id) && id > 0) ||
        !Number.isFinite(quantity) ||
        !Number.isSafeInteger(units) ||
        units <= 0 ||
        quantity > 999999999.999 ||
        Math.abs(quantity * 1000 - units) > 0.000001
      ) {
        throw new AppError('المنتج والكمية يجب أن يكونا صحيحين؛ دقة الكمية ثلاث منازل', 400);
      }
      if (from_warehouse_id === to_warehouse_id && productId === toProductId) {
        throw new AppError('لا يمكن التحويل إلى نفس المنتج والمخزن', 400);
      }
      const notes = item.notes ?? data.notes ?? '';
      if (typeof notes !== 'string' || notes.length > 1000)
        throw new AppError('ملاحظات التحويل غير صالحة', 400);
      return { productId, toProductId, quantity: units / 1000, units, notes };
    });
    // قفل كل الأطراف بترتيب ثابت قبل الخصم، بما فيها صف الوجهة الفارغ.
    const targets = new Map<string, { productId: number; warehouseId: number; rows: any[] }>();
    for (const item of items) {
      for (const [productId, warehouseId] of [
        [item.productId, from_warehouse_id],
        [item.toProductId, to_warehouse_id],
      ]) {
        targets.set(`${productId}:${warehouseId}`, { productId, warehouseId, rows: [] });
      }
    }
    for (const target of [...targets.values()].sort(
      (a, b) => a.productId - b.productId || a.warehouseId - b.warehouseId,
    )) {
      await ensureStockTarget(client, target.productId, target.warehouseId);
      await assertNotRecipeProduct(client, target.productId);
      await ensureInventoryRow(client, target.productId, target.warehouseId);
      const rows = await client.query(
        'SELECT * FROM inventory WHERE product_id = $1 AND warehouse_id = $2 ORDER BY id FOR UPDATE',
        [target.productId, target.warehouseId],
      );
      target.rows = rows.rows;
    }
    const now = new Date();
    const transferNumber = `TRF-${now.getFullYear()}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    for (const item of items) {
      const source = targets.get(`${item.productId}:${from_warehouse_id}`)!;
      const destination = targets.get(`${item.toProductId}:${to_warehouse_id}`)!;
      let remaining = item.units;
      for (const row of source.rows) {
        const stockUnits = Math.round(Number(row.quantity) * 1000);
        const reservedUnits = Math.round(Number(row.reserved_quantity ?? 0) * 1000);
        if (
          !Number.isSafeInteger(stockUnits) ||
          stockUnits < 0 ||
          !Number.isSafeInteger(reservedUnits) ||
          reservedUnits < 0 ||
          reservedUnits > stockUnits
        ) {
          throw new AppError('رصيد دفعة المخزون أو الكمية المحجوزة غير صالح؛ يلزم مراجعته', 409);
        }
        const take = Math.min(remaining, stockUnits - reservedUnits);
        if (take <= 0) continue;
        await client.query(
          'UPDATE inventory SET quantity = quantity - $1, updated_at = NOW() WHERE id = $2',
          [take / 1000, row.id],
        );
        const received = await client.query(
          `INSERT INTO inventory (product_id, warehouse_id, quantity, batch_number, expiry_date)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (product_id, warehouse_id, COALESCE(batch_number, ''))
          DO UPDATE SET quantity = inventory.quantity + EXCLUDED.quantity,
            expiry_date = EXCLUDED.expiry_date, updated_at = NOW()
          WHERE inventory.expiry_date IS NOT DISTINCT FROM EXCLUDED.expiry_date
            OR (inventory.quantity = 0 AND COALESCE(inventory.reserved_quantity, 0) = 0)
          RETURNING *`,
          [item.toProductId, to_warehouse_id, take / 1000, row.batch_number, row.expiry_date],
        );
        if (!received.rows[0])
          throw new AppError('دفعة الوجهة تحمل تاريخ صلاحية مختلفًا؛ لا يمكن دمجها', 409);
        row.quantity = (stockUnits - take) / 1000;
        const receivedRow = received.rows[0];
        const existing = destination.rows.find(
          (candidate) => Number(candidate.id) === Number(receivedRow.id),
        );
        if (existing) Object.assign(existing, receivedRow);
        else destination.rows.push(receivedRow);
        remaining -= take;
        if (!remaining) break;
      }
      if (remaining > 0)
        throw new AppError(`الكمية المتاحة غير كافية للمنتج رقم ${item.productId}`, 400);
      const note = `إذن تحويل رقم ${transferNumber}.${item.notes ? ' ' + item.notes : ''}`;
      const converted = item.productId !== item.toProductId;
      const sourceMovement = await client.query(
        `INSERT INTO stock_movements
        (product_id, from_warehouse_id, to_warehouse_id, movement_type, quantity, user_id, reference_type, notes)
        VALUES ($1, $2, $3, 'transfer', $4, $5, 'transfer_voucher', $6) RETURNING id`,
        [
          item.productId,
          from_warehouse_id,
          converted ? null : to_warehouse_id,
          item.quantity,
          userId,
          converted ? `${note} (تحويل إلى المنتج رقم ${item.toProductId})` : note,
        ],
      );
      const sourceMovementId = Number(sourceMovement.rows[0].id);
      let destinationMovementId = sourceMovementId;
      if (converted) {
        const destinationMovement = await client.query(
          `INSERT INTO stock_movements
          (product_id, from_warehouse_id, to_warehouse_id, movement_type, quantity, user_id, reference_type, reference_id, notes)
          VALUES ($1, NULL, $2, 'transfer', $3, $4, 'transfer_voucher', $5, $6) RETURNING id`,
          [
            item.toProductId,
            to_warehouse_id,
            item.quantity,
            userId,
            sourceMovementId,
            `${note} (تحويل من المنتج رقم ${item.productId})`,
          ],
        );
        destinationMovementId = Number(destinationMovement.rows[0].id);
      }
      const valuation = await transferInventoryCostLayers(
        client,
        item.productId,
        from_warehouse_id,
        item.toProductId,
        to_warehouse_id,
        item.quantity,
        destinationMovementId,
      );
      await client.query(
        'UPDATE stock_movements SET unit_cost = $1, total_cost = $2 WHERE id = ANY($3::int[])',
        [valuation.cost / item.quantity, valuation.cost, [sourceMovementId, destinationMovementId]],
      );
      if (valuation.estimatedQuantity > 0) {
        await client.query(
          'UPDATE stock_movements SET notes = notes || $1 WHERE id = ANY($2::int[])',
          [
            ` (تكلفة تقديرية لكمية ${valuation.estimatedQuantity} بلا طبقات تاريخية)`,
            [sourceMovementId, destinationMovementId],
          ],
        );
      }
    }
    await client.query('COMMIT');
    return {
      success: true,
      transfer_number: transferNumber,
      from_warehouse_id,
      to_warehouse_id,
      items_count: items.length,
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
const adjustStock = async (
  data: Record<string, any>,
  userId: number,
  transactionClient?: import('pg').PoolClient,
) => {
  const {
    product_id,
    warehouse_id,
    quantity,
    notes,
    movement_type = 'adjustment',
    min_stock,
  } = data;
  const targetQty = toNumber(quantity, NaN);
  const targetUnits = Math.round(targetQty * 1000);
  const nextMinStock = min_stock === void 0 ? void 0 : toNumber(min_stock, NaN);
  if (!product_id || !warehouse_id)
    throw new AppError(
      '\u0627\u0644\u0645\u0646\u062A\u062C \u0648\u0627\u0644\u0645\u062E\u0632\u0646 \u0645\u0637\u0644\u0648\u0628\u0627\u0646',
      400,
    );
  if (
    !Number.isFinite(targetQty) ||
    targetQty < 0 ||
    targetQty > 999999999.999 ||
    !Number.isSafeInteger(targetUnits) ||
    Math.abs(targetQty * 1000 - targetUnits) > 0.000001
  )
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
  const ownsTransaction = !transactionClient;
  const client = transactionClient ?? (await getClient());
  try {
    if (ownsTransaction) await client.query('BEGIN');
    const allowed = await getAllowedWarehouses(userId, client);
    if (!allowed.includes(Number(warehouse_id)))
      throw new AppError('لا تملك صلاحية تسوية هذا المخزن', 403);
    await ensureStockTarget(client, product_id, warehouse_id);
    await assertNotRecipeProduct(client, product_id);
    await ensureInventoryRow(client, product_id, warehouse_id);
    const current = await client.query(
      'SELECT * FROM inventory WHERE product_id = $1 AND warehouse_id = $2 ORDER BY id FOR UPDATE',
      [product_id, warehouse_id],
    );
    let currentUnits = 0;
    let reservedUnits = 0;
    for (const row of current.rows) {
      row.stockUnits = Math.round(Number(row.quantity) * 1000);
      row.reservedUnits = Math.round(Number(row.reserved_quantity ?? 0) * 1000);
      if (
        !Number.isSafeInteger(row.stockUnits) ||
        row.stockUnits < 0 ||
        !Number.isSafeInteger(row.reservedUnits) ||
        row.reservedUnits < 0 ||
        row.reservedUnits > row.stockUnits
      ) {
        throw new AppError('رصيد دفعة المخزون أو المحجوز غير صالح؛ يلزم مراجعته', 409);
      }
      currentUnits += row.stockUnits;
      reservedUnits += row.reservedUnits;
    }
    if (!Number.isSafeInteger(currentUnits) || !Number.isSafeInteger(reservedUnits))
      throw new AppError('رصيد المخزون يتجاوز الحد المقبول', 409);
    if (targetUnits < reservedUnits)
      throw new AppError('لا يمكن تسوية الرصيد إلى أقل من الكمية المحجوزة', 409);
    const deltaUnits = targetUnits - currentUnits;
    const delta = deltaUnits / 1000;
    if (deltaUnits > 0) {
      await client.query(
        `INSERT INTO inventory (product_id, warehouse_id, quantity) VALUES ($1,$2,$3)
        ON CONFLICT (product_id, warehouse_id, COALESCE(batch_number, ''))
        DO UPDATE SET quantity = inventory.quantity + EXCLUDED.quantity, updated_at = NOW()`,
        [product_id, warehouse_id, delta],
      );
    } else if (deltaUnits < 0) {
      let remaining = -deltaUnits;
      for (const row of current.rows) {
        const take = Math.min(remaining, row.stockUnits - row.reservedUnits);
        if (take > 0)
          await client.query(
            'UPDATE inventory SET quantity = quantity - $1, updated_at = NOW() WHERE id = $2',
            [take / 1000, row.id],
          );
        remaining -= take;
        if (!remaining) break;
      }
      if (remaining) throw new AppError('لا توجد كمية غير محجوزة كافية للتسوية', 409);
    }
    if (nextMinStock !== void 0) {
      await client.query(
        'UPDATE products SET min_stock = $1, updated_at = NOW() WHERE id = $2 AND deleted_at IS NULL',
        [nextMinStock, product_id],
      );
    }
    if (deltaUnits !== 0) {
      const movementQuantity = Math.abs(delta);
      const fromWarehouseId = delta < 0 ? warehouse_id : null;
      const toWarehouseId = delta > 0 ? warehouse_id : null;
      const movement = await client.query(
        'INSERT INTO stock_movements (product_id, from_warehouse_id, to_warehouse_id, movement_type, quantity, user_id, notes) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
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
      const productCost = await client.query('SELECT purchase_price FROM products WHERE id = $1', [
        product_id,
      ]);
      const unitCost = Number(productCost.rows[0]?.purchase_price);
      let cost = 0;
      let estimatedQuantity = 0;
      if (deltaUnits < 0) {
        const consumed = await depleteInventoryCostLayers(
          client,
          Number(product_id),
          Number(warehouse_id),
          movementQuantity,
        );
        estimatedQuantity = Math.max(
          0,
          Math.round((movementQuantity - consumed.quantity) * 1000) / 1000,
        );
        if (estimatedQuantity > 0 && (!Number.isFinite(unitCost) || unitCost < 0))
          throw new AppError('تكلفة الجزء بلا طبقات غير صالحة', 409);
        cost = roundMoney(
          consumed.cost + (estimatedQuantity > 0 ? estimatedQuantity * unitCost : 0),
        );
      } else {
        if (!Number.isFinite(unitCost) || unitCost < 0)
          throw new AppError('تكلفة زيادة المخزون غير صالحة', 409);
        estimatedQuantity = movementQuantity;
        cost = roundMoney(movementQuantity * unitCost);
        await client.query(
          `INSERT INTO inventory_cost_layers
          (product_id, warehouse_id, source_movement_id, source_type, quantity, remaining_quantity, unit_cost, total_cost)
          VALUES ($1,$2,$3,'adjustment_estimated',$4,$4,$5,$6)`,
          [product_id, warehouse_id, movement.rows[0].id, movementQuantity, unitCost, cost],
        );
      }
      await client.query(
        `UPDATE stock_movements SET unit_cost = $1, total_cost = $2,
        notes = notes || $3 WHERE id = $4`,
        [
          cost / movementQuantity,
          cost,
          estimatedQuantity > 0 ? ` (تكلفة تقديرية لكمية ${estimatedQuantity})` : '',
          movement.rows[0].id,
        ],
      );
    }
    if (ownsTransaction) {
      await client.query('COMMIT');
    }
  } catch (err: any) {
    if (ownsTransaction) await client.query('ROLLBACK');
    throw err;
  } finally {
    if (ownsTransaction) client.release();
  }
};
/**
 * جلب قائمة المخازن.
 * @returns {Promise<any[]>}
 */
const getWarehouses = async (userId: number) => {
  const allowed = await getAllowedWarehouses(userId);
  return (
    await query(
      `SELECT * FROM warehouses WHERE deleted_at IS NULL
    AND is_active = TRUE AND id = ANY($1::int[]) ORDER BY id`,
      [allowed],
    )
  ).rows;
};
/**
 * إرجاع منتج إلى المخزون وتسجيل حركة الإرجاع.
 * @param {Record<string, any>} data بيانات الإرجاع (product_id, warehouse_id, quantity...)
 * @param {number} userId معرف المستخدم المنفّذ
 * @returns {Promise<any>}
 */
const returnProductToStock = async (data: Record<string, any>, userId: number) => {
  const { product_id, warehouse_id, quantity, notes, sale_id } = data;
  if (sale_id !== undefined && sale_id !== null && sale_id !== '') {
    throw new AppError(
      'استرداد المنتجات المستقل لا يعالج مرتجع فاتورة بيع. استخدم إرجاع الفاتورة من شاشة المبيعات؛ الإرجاع الجزئي غير مدعوم في هذا المسار',
      409,
    );
  }
  const qty = Number(quantity);
  const units = Math.round(qty * 1000);
  if (
    !Number.isFinite(qty) ||
    qty <= 0 ||
    qty > 999999999.999 ||
    !Number.isSafeInteger(units) ||
    units <= 0 ||
    Math.abs(qty * 1000 - units) > 0.000001
  )
    throw new AppError(
      '\u0627\u0644\u0643\u0645\u064A\u0629 \u064A\u062C\u0628 \u0623\u0646 \u062A\u0643\u0648\u0646 \u0623\u0643\u0628\u0631 \u0645\u0646 \u0635\u0641\u0631',
    );
  const product = await query(
    `SELECT id, name_ar, sku FROM products WHERE id = $1 AND deleted_at IS NULL AND is_active = TRUE`,
    [product_id],
  );
  if (!product.rows[0])
    throw new AppError(
      '\u0627\u0644\u0645\u0646\u062A\u062C \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F',
      404,
    );
  const warehouse = await query(
    `SELECT id, name_ar FROM warehouses WHERE id = $1 AND deleted_at IS NULL AND is_active = TRUE`,
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
    const allowed = await getAllowedWarehouses(userId, client);
    if (!allowed.includes(Number(warehouse_id)))
      throw new AppError('لا تملك صلاحية الإرجاع إلى هذا المخزن', 403);
    await ensureStockTarget(client, product_id, warehouse_id);
    await assertNotRecipeProduct(client, product_id);
    const productCost = await client.query('SELECT purchase_price FROM products WHERE id = $1', [
      product_id,
    ]);
    const unitCost = Number(productCost.rows[0]?.purchase_price);
    if (!Number.isFinite(unitCost) || unitCost < 0)
      throw new AppError('تكلفة الاسترداد التقديرية غير صالحة', 409);
    const totalCost = roundMoney(qty * unitCost);
    await client.query(
      `INSERT INTO inventory (product_id, warehouse_id, quantity) VALUES ($1,$2,$3)
       ON CONFLICT (product_id, warehouse_id, COALESCE(batch_number, ''))
       DO UPDATE SET quantity = inventory.quantity + $3, updated_at = NOW()`,
      [product_id, warehouse_id, qty],
    );
    const refType = 'product_return';
    const refId = product_id;
    const movement = await client.query(
      `INSERT INTO stock_movements (product_id, to_warehouse_id, movement_type, quantity, reference_type, reference_id, user_id, notes, unit_cost, total_cost)
       VALUES ($1,$2,'return',$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [
        product_id,
        warehouse_id,
        qty,
        refType,
        refId,
        userId,
        `${notes || 'استرداد منتج للمخزن'} (تكلفة تقديرية بسعر الشراء الحالي)`,
        unitCost,
        totalCost,
      ],
    );
    await client.query(
      `INSERT INTO inventory_cost_layers
      (product_id, warehouse_id, source_movement_id, source_type, quantity, remaining_quantity, unit_cost, total_cost)
      VALUES ($1,$2,$3,'product_return_estimated',$4,$4,$5,$6)`,
      [product_id, warehouse_id, movement.rows[0].id, qty, unitCost, totalCost],
    );
    const stock = await client.query(
      `SELECT COALESCE(SUM(quantity), 0) AS quantity FROM inventory WHERE product_id = $1 AND warehouse_id = $2`,
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
const getProductReturns = async (filters: Record<string, any>, userId: number) => {
  const allowed = await getAllowedWarehouses(userId);
  if (!allowed.length) throw new AppError('لا يوجد مخزن مصرح به للمستخدم', 403);
  let sql = `SELECT sm.*, p.name_ar as product_name, p.sku, w.name_ar as warehouse_name, u.full_name as user_name
    FROM stock_movements sm
    JOIN products p ON sm.product_id = p.id
    LEFT JOIN warehouses w ON sm.to_warehouse_id = w.id
    LEFT JOIN users u ON sm.user_id = u.id
    WHERE sm.movement_type = 'return'
      AND sm.reference_type = 'product_return' AND sm.to_warehouse_id = ANY($1::int[])`;
  const params: any[] = [allowed];
  const i = 2;
  if (filters.product_id) {
    sql += ` AND sm.product_id = $${i}`;
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
    await client.query(`DELETE FROM inventory_cost_layers`);
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
