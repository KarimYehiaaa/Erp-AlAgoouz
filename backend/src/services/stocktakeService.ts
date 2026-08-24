import { getClient, query } from '../database/pool.ts';
import { AppError } from '../types/errors.ts';
import { invalidateDashboardCache } from './dashboardService.ts';
import { roundMoney } from '../utils/money.ts';

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

    // 1. التحقق من وجود المخزن وصلاحيته
    const whRes = await client.query(
      `SELECT id, name_ar FROM warehouses WHERE id = $1 AND deleted_at IS NULL AND is_active = TRUE`,
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
       LEFT JOIN inventory i ON i.product_id = p.id AND i.warehouse_id = $2
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
export const getStocktakeList = async () => {
  const res = await query(
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
       u.username AS creator_name,
       (SELECT COUNT(*) FROM stocktake_items WHERE stocktake_id = s.id) AS items_count
     FROM stocktakes s
     JOIN warehouses w ON s.warehouse_id = w.id
     JOIN users u ON s.created_by = u.id
     ORDER BY s.created_at DESC`,
  );
  return res.rows;
};

/**
 * جلب تفاصيل عملية جرد محددة مع بنودها
 */
/** جلب تفاصيل جرد (الأصناف والكميات الفعلية). */
export const getStocktakeDetails = async (stocktakeId: number) => {
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
export const updateStocktakeItems = async (stocktakeId: number, data: Record<string, any>) => {
  const { items = [], notes } = data;
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // التحقق من حالة الجرد
    const stocktakeRes = await client.query(
      `SELECT status FROM stocktakes WHERE id = $1 FOR UPDATE`,
      [stocktakeId],
    );
    if (!stocktakeRes.rows[0]) throw new AppError('عملية الجرد غير موجودة', 404);
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

      if (!productId) continue;
      if (actualQty !== null && (isNaN(actualQty) || actualQty < 0)) {
        throw new AppError('الكمية الفعلية يجب أن تكون قيمة موجبة أو فارغة', 400);
      }
      productIds.push(productId);
      actualQtys.push(actualQty);
    }

    if (productIds.length > 0) {
      // الفرق = الكمية الفعلية الجديدة − الكمية الدفترية (NULL عند غياب الكمية الفعلية)
      await client.query(
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
export const completeStocktake = async (stocktakeId: number, userId: number) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    // 1. قفل وسحب بيانات الجرد الرئيسي
    const stocktakeRes = await client.query(`SELECT * FROM stocktakes WHERE id = $1 FOR UPDATE`, [
      stocktakeId,
    ]);
    if (!stocktakeRes.rows[0]) throw new AppError('عملية الجرد غير موجودة', 404);

    const stocktake = stocktakeRes.rows[0];
    if (stocktake.status !== 'draft') {
      throw new AppError('عملية الجرد معتمدة ومسواة بالفعل', 400);
    }

    // 2. سحب جميع بنود الجرد
    const itemsRes = await client.query(
      `SELECT si.*, p.name_ar 
       FROM stocktake_items si 
       JOIN products p ON si.product_id = p.id
       WHERE si.stocktake_id = $1`,
      [stocktakeId],
    );
    const items = itemsRes.rows;

    let totalDeficit = 0;
    let totalSurplus = 0;

    // 3. تسوية كل بند يوجد فيه فرق
    for (const item of items) {
      // إذا لم يتم إدخال كمية فعلية، نتخطى التسوية لهذا الصنف
      if (item.actual_quantity === null || item.actual_quantity === undefined) {
        continue;
      }

      const actQty = Number(item.actual_quantity);
      const cost = Number(item.unit_cost);

      // قفل كل صفوف المخزون للمنتج في هذا المخزن (كل الدفعات) ثم قراءة
      // الإجمالي الدفتري الحالي — قد تكون حدثت حركات بيع/شراء بعد إنشاء
      // مسودة الجرد، ويجب حساب الفرق مقابل إجمالي الكمية الحالية
      await client.query(
        `SELECT product_id FROM inventory WHERE product_id = $1 AND warehouse_id = $2 FOR UPDATE`,
        [item.product_id, stocktake.warehouse_id],
      );
      const sumRes = await client.query(
        `SELECT COALESCE(SUM(quantity), 0)::numeric AS total FROM inventory
         WHERE product_id = $1 AND warehouse_id = $2`,
        [item.product_id, stocktake.warehouse_id],
      );
      const currentQty = Number(sumRes.rows[0].total || 0);
      const diff = actQty - currentQty;

      if (Math.abs(diff) > 0.0001) {
        const movementQty = Math.abs(diff);
        const movementValue = roundMoney(movementQty * cost);

        if (diff < 0) {
          totalDeficit += movementValue;
        } else {
          totalSurplus += movementValue;
        }

        // ضبط الصف الافتراضي على الكمية الفعلية وتصفير باقي الدفعات —
        // الجرد الفعلي لا يفرّق بين الدفعات فيجب أن يساوي الإجمالي الكمية المعدودة
        await client.query(
          `INSERT INTO inventory (product_id, warehouse_id, quantity)
           VALUES ($1, $2, $3)
           ON CONFLICT (product_id, warehouse_id, COALESCE(batch_number, ''))
           DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = NOW()`,
          [item.product_id, stocktake.warehouse_id, actQty],
        );
        await client.query(
          `UPDATE inventory SET quantity = 0, updated_at = NOW()
           WHERE product_id = $1 AND warehouse_id = $2
             AND batch_number IS NOT NULL AND batch_number <> ''`,
          [item.product_id, stocktake.warehouse_id],
        );

        // تسجيل الحركة المخزنية من نوع adjustment
        const fromWh = diff < 0 ? stocktake.warehouse_id : null;
        const toWh = diff > 0 ? stocktake.warehouse_id : null;
        const note = `تسوية جرد تلقائية - معرف الجرد: ${stocktake.id}`;

        await client.query(
          `INSERT INTO stock_movements (
             product_id, from_warehouse_id, to_warehouse_id, movement_type, 
             quantity, user_id, notes, unit_cost, total_cost
           ) VALUES ($1, $2, $3, 'adjustment', $4, $5, $6, $7, $8)`,
          [item.product_id, fromWh, toWh, movementQty, userId, note, cost, movementValue],
        );
      }
    }

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

    await client.query('COMMIT');
    invalidateDashboardCache();

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
export const deleteStocktake = async (stocktakeId: number) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const stocktakeRes = await client.query(
      `SELECT status FROM stocktakes WHERE id = $1 FOR UPDATE`,
      [stocktakeId],
    );

    if (!stocktakeRes.rows[0]) {
      throw new AppError('عملية الجرد غير موجودة', 404);
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
