import { getClient, query } from '../database/pool.ts';
import { AppError } from '../types/errors.ts';
import { roundMoney } from '../utils/money.ts';
import { getAllowedWarehouses } from '../middleware/warehouseAccess.ts';
import { depleteInventoryCostLayers } from './productCostService.ts';

/**
 * إنشاء عملية جرد جديدة كمسودة للمخزن المحدد
 */
/**
 * إنشاء جرد جديد لمخزن.
 * @param {number} warehouseId معرف المخزن
 * @param {number} userId معرف المستخدم المنفّذ
 * @param {string} [notes] ملاحظات
 * @returns {Promise<any>}
 */
export const createStocktake = async (warehouseId: number, userId: number, notes: string = '') => {
  if (!warehouseId) throw new AppError('المخزن مطلوب لبدء عملية الجرد', 400);

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const allowed = await getAllowedWarehouses(userId, client);
    if (!allowed.includes(Number(warehouseId)))
      throw new AppError('لا تملك صلاحية جرد هذا المخزن', 403);

    // 1. التحقق من وجود المخزن وصلاحيته
    const whRes = await client.query(
      `SELECT id, name_ar FROM warehouses WHERE id = $1 AND deleted_at IS NULL AND is_active = TRUE FOR UPDATE`,
      [warehouseId],
    );
    if (!whRes.rows[0]) {
      throw new AppError('المخزن المحدد غير موجود أو غير نشط', 404);
    }

    // 2. التحقق من عدم وجود جرد معلق (مسودة) لنفس المخزن لتفادي التعارض
    const pendingRes = await client.query(
      `SELECT id FROM stocktakes WHERE warehouse_id = $1 AND status = 'draft' LIMIT 1`,
      [warehouseId],
    );
    if (pendingRes.rows[0]) {
      throw new AppError(
        'يوجد عملية جرد مسودة معلقة بالفعل لهذا المخزن. يرجى اعتمادها أو حذفها أولاً.',
        400,
      );
    }

    // 3. إنشاء الجرد الرئيسي
    const stocktakeRes = await client.query(
      `INSERT INTO stocktakes (warehouse_id, status, notes, created_by)
       VALUES ($1, 'draft', $2, $3)
       RETURNING *`,
      [warehouseId, notes, userId],
    );
    const stocktake = stocktakeRes.rows[0];

    // 4-5. إدخال بنود الجرد التفصيلية دفعة واحدة (set-based) —
    // جميع المنتجات النشطة (التي ليست وصفات نشطة) مع كمياتها الدفترية وتكلفتها من purchase_price
    // بدلاً من حلقة INSERT لكل منتج على حدة (كانت N query لكل عملية جرد)
    const itemsRes = await client.query(
      `INSERT INTO stocktake_items (stocktake_id, product_id, system_quantity, unit_cost)
       SELECT $1, p.id, COALESCE(i.quantity, 0), COALESCE(p.purchase_price, 0)
       FROM products p
       LEFT JOIN LATERAL (SELECT SUM(quantity) AS quantity FROM inventory
         WHERE product_id = p.id AND warehouse_id = $2) i ON TRUE
       WHERE p.deleted_at IS NULL
         AND p.is_active = TRUE
         AND NOT EXISTS (
           SELECT 1
           FROM product_recipes r
           WHERE r.product_id = p.id
             AND r.deleted_at IS NULL
             AND r.is_active = TRUE
         )`,
      [stocktake.id, warehouseId],
    );
    const itemsCount = itemsRes.rowCount || 0;

    await client.query('COMMIT');
    return { ...stocktake, items_count: itemsCount };
  } catch (err: any) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * جلب قائمة عمليات الجرد التاريخية
 */
/**
 * جلب قائمة الجرد.
 * @returns {Promise<any[]>}
 */
export const getStocktakeList = async (allowedWarehouseIds?: number[]) => {
  let sql = `SELECT
       s.id,
       s.warehouse_id,
       s.status,
       s.notes,
       s.created_by,
       s.created_at,
       s.completed_at,
       s.total_deficit_value::numeric AS total_deficit_value,
       s.total_surplus_value::numeric AS total_surplus_value,
       w.name_ar AS warehouse_name,
       u.username AS creator_name,
       (SELECT COUNT(*) FROM stocktake_items WHERE stocktake_id = s.id) AS items_count
     FROM stocktakes s
     JOIN warehouses w ON s.warehouse_id = w.id
     JOIN users u ON s.created_by = u.id`;
  const params: any[] = [];
  if (allowedWarehouseIds !== undefined) {
    sql += ` WHERE s.warehouse_id = ANY($1::int[])`;
    params.push(allowedWarehouseIds);
  }
  sql += ` ORDER BY s.created_at DESC`;
  const res = await query(sql, params);
  return res.rows;
};

/**
 * جلب تفاصيل عملية جرد محددة مع بنودها
 */
/** جلب تفاصيل جرد (الأصناف والكميات الفعلية). */
export const getStocktakeDetails = async (
  stocktakeId: number | string,
  allowedWarehouseIds?: number[],
) => {
  const stocktakeRes = await query(
    `SELECT
       s.id,
       s.warehouse_id,
       s.status,
       s.notes,
       s.created_by,
       s.created_at,
       s.completed_at,
       s.total_deficit_value::numeric AS total_deficit_value,
       s.total_surplus_value::numeric AS total_surplus_value,
       w.name_ar AS warehouse_name,
       u.username AS creator_name
     FROM stocktakes s
     JOIN warehouses w ON s.warehouse_id = w.id
     JOIN users u ON s.created_by = u.id
     WHERE s.id = $1`,
    [stocktakeId],
  );

  if (!stocktakeRes.rows[0]) {
    throw new AppError('عملية الجرد المطلوبة غير موجودة', 404);
  }

  if (allowedWarehouseIds !== undefined) {
    if (!allowedWarehouseIds.includes(Number(stocktakeRes.rows[0].warehouse_id))) {
      throw new AppError('غير مصرح لك بالوصول لبيانات جرد هذا المخزن', 403);
    }
  }

  const itemsRes = await query(
    `SELECT
       si.id,
       si.stocktake_id,
       si.product_id,
       si.system_quantity::numeric AS system_quantity,
       si.actual_quantity::numeric AS actual_quantity,
       si.difference::numeric AS difference,
       si.unit_cost::numeric AS unit_cost,
       p.name_ar AS product_name,
       p.sku,
       p.unit
     FROM stocktake_items si
     JOIN products p ON si.product_id = p.id
     WHERE si.stocktake_id = $1
     ORDER BY p.name_ar`,
    [stocktakeId],
  );

  return {
    ...stocktakeRes.rows[0],
    items: itemsRes.rows,
  };
};

/**
 * تحديث مسودة الجرد (حفظ الكميات الفعلية وملاحظات الجرد)
 */
/**
 * تحديث كميات الجرد الفعلية.
 * @param {number} stocktakeId معرف الجرد
 * @param {Record<string, any>} data عناصر الجرد
 * @returns {Promise<any>}
 */
export const updateStocktakeItems = async (
  stocktakeId: number | string,
  data: Record<string, any>,
  allowedWarehouseIds?: number[],
) => {
  const { items = [], notes } = data;
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // التحقق من حالة الجرد
    const stocktakeRes = await client.query(
      `SELECT id, warehouse_id, status FROM stocktakes WHERE id = $1 FOR UPDATE`,
      [stocktakeId],
    );
    if (!stocktakeRes.rows[0]) throw new AppError('عملية الجرد غير موجودة', 404);

    if (allowedWarehouseIds !== undefined) {
      if (!allowedWarehouseIds.includes(Number(stocktakeRes.rows[0].warehouse_id))) {
        throw new AppError('غير مصرح لك بتعديل جرد هذا المخزن', 403);
      }
    }

    if (stocktakeRes.rows[0].status !== 'draft') {
      throw new AppError('لا يمكن تعديل بنود عملية جرد تم اعتمادها وتسويتها', 400);
    }

    // تحديث الملاحظات إن وجدت
    if (notes !== undefined) {
      await client.query(`UPDATE stocktakes SET notes = $1 WHERE id = $2`, [notes, stocktakeId]);
    }

    // تحديث البنود دفعة واحدة (set-based) بدلاً من SELECT + UPDATE لكل بند
    // التحقق من الصحة أولاً ثم تحديث الصفوف الموجودة فقط عبر UPDATE ... FROM (VALUES)
    const productIds: number[] = [];
    const actualQtys: (number | null)[] = [];
    for (const item of items) {
      const productId = Number(item.product_id);
      const actualQty =
        item.actual_quantity === null || item.actual_quantity === undefined
          ? null
          : Number(item.actual_quantity);

      if (!Number.isSafeInteger(productId) || productId <= 0 || productIds.includes(productId)) {
        throw new AppError('معرف المنتج غير صالح أو مكرر في بنود الجرد', 400);
      }
      if (
        actualQty !== null &&
        (!Number.isFinite(actualQty) ||
          actualQty < 0 ||
          actualQty > 999999999.999 ||
          Math.abs(actualQty * 1000 - Math.round(actualQty * 1000)) > 0.000001)
      ) {
        throw new AppError('الكمية الفعلية يجب أن تكون قيمة موجبة أو فارغة', 400);
      }
      productIds.push(productId);
      actualQtys.push(actualQty);
    }

    if (productIds.length > 0) {
      // الفرق = الكمية الفعلية الجديدة − الكمية الدفترية (NULL عند غياب الكمية الفعلية)
      const updated = await client.query(
        `UPDATE stocktake_items si
         SET actual_quantity = v.actual_qty,
             difference = CASE WHEN v.actual_qty IS NULL THEN NULL ELSE v.actual_qty - si.system_quantity END
         FROM (
           SELECT u.pid AS product_id, u.qty AS actual_qty
           FROM unnest($2::int[], $3::numeric[]) AS u(pid, qty)
         ) v
         WHERE si.stocktake_id = $1 AND si.product_id = v.product_id`,
        [stocktakeId, productIds, actualQtys],
      );
      if (updated.rowCount !== productIds.length)
        throw new AppError('أحد المنتجات غير موجود أو مكرر في مسودة الجرد', 409);
    }

    await client.query('COMMIT');
    return { success: true, message: 'تم حفظ مسودة الجرد بنجاح' };
  } catch (err: any) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * اعتماد عملية الجرد وتسوية الفروقات في المستودعات
 */
/**
 * إكمال الجرد وتطبيق الفروقات على المخزون.
 * @param {number} stocktakeId معرف الجرد
 * @param {number} userId معرف المستخدم المنفّذ
 * @returns {Promise<any>}
 */
export const completeStocktake = async (
  stocktakeId: number | string,
  userId: number,
  allowedWarehouseIds?: number[],
) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    // 1. قفل وسحب بيانات الجرد الرئيسي
    const stocktakeRes = await client.query(`SELECT * FROM stocktakes WHERE id = $1 FOR UPDATE`, [
      stocktakeId,
    ]);
    if (!stocktakeRes.rows[0]) throw new AppError('عملية الجرد غير موجودة', 404);

    const stocktake = stocktakeRes.rows[0];
    const currentAllowed = await getAllowedWarehouses(userId, client);
    if (!currentAllowed.includes(Number(stocktake.warehouse_id)))
      throw new AppError('لا تملك صلاحية اعتماد جرد هذا المخزن', 403);

    if (allowedWarehouseIds !== undefined) {
      if (!allowedWarehouseIds.includes(Number(stocktake.warehouse_id))) {
        throw new AppError('غير مصرح لك باعتماد جرد هذا المخزن', 403);
      }
    }
    if (stocktake.status !== 'draft') {
      throw new AppError('عملية الجرد معتمدة ومسواة بالفعل', 400);
    }
    const warehouse = await client.query(
      `SELECT id FROM warehouses WHERE id = $1
      AND deleted_at IS NULL AND is_active = TRUE FOR SHARE`,
      [stocktake.warehouse_id],
    );
    if (!warehouse.rows[0]) throw new AppError('مخزن الجرد غير نشط أو محذوف', 409);

    // 2. سحب جميع بنود الجرد
    const itemsRes = await client.query(
      `SELECT si.*, p.name_ar
       FROM stocktake_items si
       JOIN products p ON si.product_id = p.id
       WHERE si.stocktake_id = $1 ORDER BY si.product_id, si.id`,
      [stocktakeId],
    );
    const items = itemsRes.rows;

    let totalDeficit = 0;
    let totalSurplus = 0;

    const seenProducts = new Set<number>();
    // الاحتفاظ بالدفعات والمحجوز؛ التسوية تطبق فرق الإجمالي فقط.
    for (const item of items) {
      const productId = Number(item.product_id);
      if (seenProducts.has(productId))
        throw new AppError('المسودة تحتوي على منتج مكرر؛ يلزم مراجعتها قبل الاعتماد', 409);
      seenProducts.add(productId);
      if (item.actual_quantity == null) continue;
      const targetProduct = await client.query(
        `SELECT p.id FROM products p WHERE p.id = $1
        AND p.deleted_at IS NULL AND p.is_active = TRUE AND NOT EXISTS
        (SELECT 1 FROM product_recipes r WHERE r.product_id = p.id AND r.deleted_at IS NULL AND r.is_active = TRUE)`,
        [productId],
      );
      if (!targetProduct.rows[0])
        throw new AppError('أحد منتجات الجرد غير نشط أو مرتبط بوصفة؛ يلزم مراجعة المسودة', 409);
      const actualUnits = Math.round(Number(item.actual_quantity) * 1000);
      if (
        !Number.isSafeInteger(actualUnits) ||
        actualUnits < 0 ||
        actualUnits > 999999999999 ||
        Math.abs(Number(item.actual_quantity) * 1000 - actualUnits) > 0.000001
      ) {
        throw new AppError('كمية الجرد غير صالحة أو تتجاوز دقة المخزون', 409);
      }
      // Ensure the default-batch row exists as a transaction-scoped serialization point.
      await client.query(
        `INSERT INTO inventory (product_id, warehouse_id, quantity) VALUES ($1,$2,0)
        ON CONFLICT (product_id, warehouse_id, COALESCE(batch_number, '')) DO NOTHING`,
        [productId, stocktake.warehouse_id],
      );
      const stockRows = await client.query(
        `SELECT * FROM inventory WHERE product_id = $1 AND warehouse_id = $2
        ORDER BY id FOR UPDATE`,
        [productId, stocktake.warehouse_id],
      );
      let currentUnits = 0;
      let reservedUnits = 0;
      for (const row of stockRows.rows) {
        row.units = Math.round(Number(row.quantity) * 1000);
        row.reservedUnits = Math.round(Number(row.reserved_quantity ?? 0) * 1000);
        if (
          !Number.isSafeInteger(row.units) ||
          row.units < 0 ||
          !Number.isSafeInteger(row.reservedUnits) ||
          row.reservedUnits < 0 ||
          row.reservedUnits > row.units
        )
          throw new AppError('رصيد دفعة الجرد أو المحجوز غير صالح', 409);
        currentUnits += row.units;
        reservedUnits += row.reservedUnits;
      }
      if (!Number.isSafeInteger(currentUnits) || !Number.isSafeInteger(reservedUnits))
        throw new AppError('إجمالي المخزون غير صالح', 409);
      if (actualUnits < reservedUnits)
        throw new AppError('رصيد الجرد أقل من المحجوز؛ راجع الحجز قبل الاعتماد', 409);
      const deltaUnits = actualUnits - currentUnits;
      const diff = deltaUnits / 1000;
      await client.query(
        'UPDATE stocktake_items SET system_quantity = $1, difference = $2 WHERE id = $3',
        [currentUnits / 1000, diff, item.id],
      );
      if (!deltaUnits) continue;
      if (deltaUnits > 0) {
        await client.query(
          `INSERT INTO inventory (product_id, warehouse_id, quantity) VALUES ($1,$2,$3)
          ON CONFLICT (product_id, warehouse_id, COALESCE(batch_number, ''))
          DO UPDATE SET quantity = inventory.quantity + EXCLUDED.quantity, updated_at = NOW()`,
          [productId, stocktake.warehouse_id, diff],
        );
      } else {
        let remaining = -deltaUnits;
        for (const row of stockRows.rows) {
          const take = Math.min(remaining, row.units - row.reservedUnits);
          if (take > 0)
            await client.query(
              'UPDATE inventory SET quantity = quantity - $1, updated_at = NOW() WHERE id = $2',
              [take / 1000, row.id],
            );
          remaining -= take;
          if (!remaining) break;
        }
        if (remaining) throw new AppError('رصيد غير محجوز غير كاف لتسوية الجرد', 409);
      }
      const movementQty = Math.abs(diff);
      const estimatedCost = Number(item.unit_cost);
      let estimatedQuantity = 0;
      let movementValue = 0;
      if (deltaUnits < 0) {
        const consumed = await depleteInventoryCostLayers(
          client,
          productId,
          Number(stocktake.warehouse_id),
          movementQty,
        );
        estimatedQuantity = Math.max(
          0,
          Math.round((movementQty - consumed.quantity) * 1000) / 1000,
        );
        if (estimatedQuantity > 0 && (!Number.isFinite(estimatedCost) || estimatedCost < 0))
          throw new AppError('تكلفة الجزء بلا طبقات غير صالحة', 409);
        movementValue = roundMoney(
          consumed.cost + (estimatedQuantity > 0 ? estimatedQuantity * estimatedCost : 0),
        );
        totalDeficit += movementValue;
      } else {
        if (!Number.isFinite(estimatedCost) || estimatedCost < 0)
          throw new AppError('تكلفة زيادة الجرد غير صالحة', 409);
        estimatedQuantity = movementQty;
        movementValue = roundMoney(movementQty * estimatedCost);
        totalSurplus += movementValue;
      }
      const note = `تسوية جرد تلقائية - معرف الجرد: ${stocktake.id}${estimatedQuantity > 0 ? ` (تكلفة تقديرية لكمية ${estimatedQuantity})` : ''}`;
      const movement = await client.query(
        `INSERT INTO stock_movements
        (product_id, from_warehouse_id, to_warehouse_id, movement_type, quantity, user_id, notes, unit_cost, total_cost, reference_type)
        VALUES ($1,$2,$3,'adjustment',$4,$5,$6,$7,$8,'stocktake') RETURNING id`,
        [
          productId,
          deltaUnits < 0 ? stocktake.warehouse_id : null,
          deltaUnits > 0 ? stocktake.warehouse_id : null,
          movementQty,
          userId,
          note,
          movementValue / movementQty,
          movementValue,
        ],
      );
      if (deltaUnits > 0) {
        await client.query(
          `INSERT INTO inventory_cost_layers
          (product_id, warehouse_id, source_movement_id, source_type, quantity, remaining_quantity, unit_cost, total_cost)
          VALUES ($1,$2,$3,'stocktake_estimated',$4,$4,$5,$6)`,
          [
            productId,
            stocktake.warehouse_id,
            movement.rows[0].id,
            movementQty,
            estimatedCost,
            movementValue,
          ],
        );
      }
    }

    totalDeficit = roundMoney(totalDeficit);
    totalSurplus = roundMoney(totalSurplus);
    // 4. تحديث حالة الجرد الرئيسي وقيم الفروقات الإجمالية
    await client.query(
      `UPDATE stocktakes
       SET status = 'completed',
           completed_at = NOW(),
           total_deficit_value = $1,
           total_surplus_value = $2
       WHERE id = $3`,
      [totalDeficit, totalSurplus, stocktakeId],
    );

    // 5. تسجيل خسارة العجز المخزني كمصروف تشغيلي (F-09)
    if (totalDeficit > 0.001) {
      let categoryId: number;
      const catRes = await client.query(
        `SELECT id FROM expense_categories WHERE slug = 'inventory-shrinkage' OR slug = 'shrinkage' LIMIT 1`,
      );
      if (catRes.rows.length > 0) {
        categoryId = catRes.rows[0].id;
      } else {
        const insCat = await client.query(
          `INSERT INTO expense_categories (name_ar, slug, is_active)
           VALUES ('عجز وفاقد مخزني', 'inventory-shrinkage', true)
           ON CONFLICT (slug) DO UPDATE SET name_ar = EXCLUDED.name_ar
           RETURNING id`,
        );
        categoryId = insCat.rows[0].id;
      }

      const seqRes = await client.query(`SELECT nextval('seq_expenses_number') AS next_val`);
      const expNumber = `EXP-STK-${stocktake.id}-${seqRes.rows[0].next_val}`;

      await client.query(
        `INSERT INTO expenses (
           expense_number, category_id, title, amount, expense_date, payment_method, notes, user_id
         ) VALUES ($1, $2, $3, $4, CURRENT_DATE, 'adjustment', $5, $6)`,
        [
          expNumber,
          categoryId,
          `عجز جرد مخزني - جرد رقم #${stocktake.id}`,
          totalDeficit,
          `تسوية خسارة عجز المخزون تلقائياً من عملية الاعتماد للجرد رقم ${stocktake.id}`,
          userId,
        ],
      );
    }

    // 6. ترحيل قيد الفروقات الجردية (عجز أو فائض) إلى الأستاذ العام
    if (totalDeficit > 0.001 || totalSurplus > 0.001) {
      const { accountingService } = await import('./accountingService.ts');
      await accountingService.postStocktakeJournalEntry(client, {
        id: stocktake.id,
        warehouse_id: stocktake.warehouse_id,
        total_deficit: totalDeficit,
        total_surplus: totalSurplus,
        user_id: userId,
      });
    }

    await client.query('COMMIT');

    return {
      success: true,
      message: 'تم اعتماد الجرد وتسوية الفروقات بنجاح',
      total_deficit_value: totalDeficit,
      total_surplus_value: totalSurplus,
    };
  } catch (err: any) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/** حذف جرد (المسودة فقط) — داخل معاملة مع قفل لمنع سباق الاعتماد المتزامن. */
export const deleteStocktake = async (
  stocktakeId: number | string,
  allowedWarehouseIds?: number[],
) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const stocktakeRes = await client.query(
      `SELECT id, warehouse_id, status FROM stocktakes WHERE id = $1 FOR UPDATE`,
      [stocktakeId],
    );

    if (!stocktakeRes.rows[0]) {
      throw new AppError('عملية الجرد غير موجودة', 404);
    }

    if (allowedWarehouseIds !== undefined) {
      if (!allowedWarehouseIds.includes(Number(stocktakeRes.rows[0].warehouse_id))) {
        throw new AppError('غير مصرح لك بحذف جرد هذا المخزن', 403);
      }
    }

    if (stocktakeRes.rows[0].status !== 'draft') {
      throw new AppError('لا يمكن حذف عملية جرد تم اعتمادها وتسويتها تاريخياً', 400);
    }

    // سيقوم بحذف البنود تلقائياً بسبب ON DELETE CASCADE
    await client.query(`DELETE FROM stocktakes WHERE id = $1`, [stocktakeId]);
    await client.query('COMMIT');
    return { success: true, message: 'تم حذف مسودة الجرد بنجاح' };
  } catch (err: any) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};
