/**
 * saleInventoryOps.ts — عمليات المخزون المرتبطة بدورة المبيعات
 * منطق المخزون استُخرج من salesService.ts لتقليل حجم الملف المركزي:
 *  - resolveSaleWarehouseId   : تحديد مخزن البيع تلقائيًا (أساسي/مشترك/افتراضي)
 *  - applySaleItems           : تطبيق أصناف البيع على المخزون (قفل + خصم + حركات)
 *  - restoreInventoryForSale  : استرجاع المخزون عند الإرجاع/التعديل/الحذف
 * كل الدوال تعمل داخل معاملة (client) يوفّرها المتصل.
 */
import { query } from '../database/pool.ts';
import { AppError } from '../types/errors.ts';
import * as recipesService from './recipesService.ts';
import { getProductsEffectiveCosts, depleteInventoryCostLayers } from './productCostService.ts';
import * as inventoryService from './inventoryService.ts';
import { getDefaultWarehouseId } from './warehouseService.ts';
import { roundMoney, sumMoney } from '../utils/money.ts';
import { getAllowedWarehouses } from '../middleware/warehouseAccess.ts';

/**
 * تحديد مخزن البيع: المخزن المطلوب ← الأساسي الوحيد للمنتجات ← المخزن الذي فيه الكمية ← الافتراضي.
 * @param {any[]} [items] أصناف البيع
 * @param {any} [requestedWarehouseId] معرف المخزن المطلوب (إن وُجد)
 * @returns {Promise<number>} معرف المخزن المحدد
 * @throws {AppError} إذا تعذّر تحديد مخزن واحد واضح
 */
const resolveSaleWarehouseId = async (items: any[] = [], requestedWarehouseId: any = null) => {
  let warehouseId = requestedWarehouseId ? Number(requestedWarehouseId) : null;
  if (!warehouseId && items.length) {
    const productIds = items.map((it) => it.product_id);
    const productsRes = await query(
      `SELECT id, primary_warehouse_id FROM products WHERE id = ANY($1) AND deleted_at IS NULL`,
      [productIds],
    );
    const productMap = new Map(productsRes.rows.map((p) => [Number(p.id), p.primary_warehouse_id]));
    const primaryWarehouses = [
      ...new Set(productIds.map((id) => productMap.get(id)).filter(Boolean)),
    ];
    if (primaryWarehouses.length === 1) {
      warehouseId = primaryWarehouses[0];
    } else if (primaryWarehouses.length > 1) {
      throw new AppError(
        '\u0627\u0644\u0645\u0646\u062A\u062C\u0627\u062A \u062A\u0646\u062A\u0645\u064A \u0644\u0645\u062E\u0627\u0632\u0646 \u0645\u062E\u062A\u0644\u0641\u0629 \u2014 \u0644\u0627 \u064A\u0645\u0643\u0646 \u062F\u0645\u062C \u0627\u0644\u0645\u062E\u0627\u0632\u0646',
      );
    } else {
      const invRes = await query(
        `SELECT DISTINCT ON (product_id) product_id, warehouse_id
         FROM inventory
         WHERE product_id = ANY($1)
         ORDER BY product_id, quantity DESC, id ASC`,
        [productIds],
      );
      const invMap = new Map(invRes.rows.map((r) => [Number(r.product_id), r.warehouse_id]));
      const invWarehouses = [...new Set(productIds.map((id) => invMap.get(id)).filter(Boolean))];
      if (invWarehouses.length === 1) {
        warehouseId = invWarehouses[0];
      } else if (invWarehouses.length > 1) {
        throw new AppError(
          '\u0627\u0644\u0645\u0646\u062A\u062C\u0627\u062A \u062A\u0646\u062A\u0645\u064A \u0644\u0645\u062E\u0627\u0632\u0646 \u0645\u062E\u062A\u0644\u0641\u0629 \u2014 \u0644\u0627 \u064A\u0645\u0643\u0646 \u062F\u0645\u062C \u0627\u0644\u0645\u062E\u0627\u0632\u0646',
        );
      }
    }
  }
  if (!warehouseId) {
    warehouseId = await getDefaultWarehouseId();
  }
  if (!warehouseId) {
    throw new AppError(
      '\u0644\u0627 \u064A\u0645\u0643\u0646 \u062A\u062D\u062F\u064A\u062F \u0627\u0644\u0645\u062E\u0632\u0646 \u0627\u0644\u0627\u0641\u062A\u0631\u0627\u0636\u064A \u0644\u0644\u0628\u064A\u0639',
      400,
    );
  }
  return warehouseId;
};

/**
 * تطبيق أصناف البيع على المخزون: إدراج الأصناف، خصم الكميات من المخازن
 * (مع أقفال FOR UPDATE بترتيب تصاعدي لمنع deadlock)، واستهلاك الوصفات.
 * @param {import('pg').PoolClient} client عميل المعاملة
 * @param {{ saleId: number, items: any[], warehouseId: number, userId: number }} args بيانات التطبيق
 * @returns {Promise<number>} إجمالي تكلفة البضاعة المباعة (COGS)
 */
const applySaleItems = async (
  client: import('pg').PoolClient,
  {
    saleId,
    items,
    warehouseId,
    userId,
  }: { saleId: number; items: any[]; warehouseId: number; userId: number },
) => {
  let costAmount = 0;
  const productIds = items.map((it) => Number(it.product_id));
  const costsMap = await getProductsEffectiveCosts(client, productIds);
  const recipeCheck = await client.query(
    `SELECT product_id FROM product_recipes
     WHERE product_id = ANY($1::int[]) AND deleted_at IS NULL AND is_active = TRUE`,
    [productIds],
  );
  const recipeSet = new Set(recipeCheck.rows.map((row) => Number(row.product_id)));
  const productNamesRes = await client.query(
    `SELECT id, name_ar FROM products WHERE id = ANY($1::int[])`,
    [productIds],
  );
  const productNamesMap = new Map(productNamesRes.rows.map((row) => [Number(row.id), row.name_ar]));
  const nonRecipeProductIds = productIds.filter((id) => !recipeSet.has(id));
  if (nonRecipeProductIds.length > 0) {
    for (const pid of nonRecipeProductIds) {
      await inventoryService.ensureInventoryRow(client, pid, warehouseId);
    }
    const sortedIds = [...new Set(nonRecipeProductIds)].sort(
      (a, b) => (a as number) - (b as number),
    );
    await client.query(
      `SELECT product_id, quantity FROM inventory
       WHERE warehouse_id = $1 AND product_id = ANY($2::int[])
       ORDER BY product_id, id FOR UPDATE`,
      [warehouseId, sortedIds],
    );
  }
  // ترتيب العناصر تصاعدياً بناءً على product_id لمنع Deadlock عند القفل المتزامن
  const sortedItems = [...items].sort((a, b) => Number(a.product_id) - Number(b.product_id));
  for (const it of sortedItems) {
    const qty = Number(it.quantity || 0);
    const unitPrice = Number(it.unit_price || 0);
    const lineTotal = it.total_amount;
    const effectiveCost = costsMap.get(Number(it.product_id)) || { cost: 0 };
    const unitCost = roundMoney(Number(effectiveCost.cost || 0));
    const saleItem = await client.query(
      `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, cost_price, discount_amount, tax_amount, total_amount)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [
        saleId,
        it.product_id,
        qty,
        unitPrice,
        unitCost,
        it.discount_amount || 0,
        it.tax_amount || 0,
        lineTotal,
      ],
    );
    if (recipeSet.has(Number(it.product_id))) {
      const consumedRecipe = await recipesService.consumeRecipeForSale(client, {
        productId: it.product_id,
        soldQty: qty,
        warehouseId,
        referenceType: 'sale',
        referenceId: saleId,
        userId,
      });
      costAmount = sumMoney(costAmount, consumedRecipe.cost);
      await client.query('UPDATE sale_items SET cost_price = $1 WHERE id = $2', [
        consumedRecipe.cost / qty,
        saleItem.rows[0].id,
      ]);
    } else {
      const primaryLock = await client.query(
        `SELECT id, quantity, reserved_quantity FROM inventory WHERE product_id = $1 AND warehouse_id = $2 ORDER BY id FOR UPDATE`,
        [it.product_id, warehouseId],
      );
      const units = Math.round(qty * 1000);
      if (
        !Number.isSafeInteger(units) ||
        units <= 0 ||
        qty > 999999999.999 ||
        Math.abs(qty * 1000 - units) > 0.000001
      ) {
        throw new AppError('كمية البيع غير صالحة أو تتجاوز دقة ثلاث منازل', 400);
      }
      let availableUnits = 0;
      for (const row of primaryLock.rows) {
        row.units = Math.round(Number(row.quantity) * 1000);
        row.reservedUnits = Math.round(Number(row.reserved_quantity ?? 0) * 1000);
        if (
          !Number.isSafeInteger(row.units) ||
          row.units < 0 ||
          !Number.isSafeInteger(row.reservedUnits) ||
          row.reservedUnits < 0 ||
          row.reservedUnits > row.units
        )
          throw new AppError('رصيد دفعة البيع أو المحجوز غير صالح', 409);
        availableUnits += row.units - row.reservedUnits;
      }
      if (!Number.isSafeInteger(availableUnits))
        throw new AppError('رصيد البيع يتجاوز الحد المقبول', 409);
      const primaryQty = availableUnits / 1000;
      if (primaryQty < qty) {
        const pName = productNamesMap.get(Number(it.product_id)) || 'المنتج';
        throw new AppError(
          `لا يوجد مخزون كافٍ للمنتج "${pName}" في المخزن المحدد. المطلوب: ${qty}، المتاح: ${primaryQty}`,
          400,
        );
      }
      let remainingUnits = units;
      for (const row of primaryLock.rows) {
        const take = Math.min(remainingUnits, row.units - row.reservedUnits);
        if (take > 0)
          await client.query(
            'UPDATE inventory SET quantity = quantity - $1, updated_at = NOW() WHERE id = $2',
            [take / 1000, row.id],
          );
        remainingUnits -= take;
        if (!remainingUnits) break;
      }
      const consumed = await depleteInventoryCostLayers(
        client,
        Number(it.product_id),
        warehouseId,
        qty,
      );
      const estimatedQuantity = Math.max(0, Math.round((qty - consumed.quantity) * 1000) / 1000);
      if (estimatedQuantity > 0 && (!Number.isFinite(unitCost) || unitCost < 0))
        throw new AppError('تكلفة الجزء بلا طبقات غير صالحة', 409);
      const actualLineCost = roundMoney(
        consumed.cost + (estimatedQuantity > 0 ? estimatedQuantity * unitCost : 0),
      );
      costAmount = sumMoney(costAmount, actualLineCost);
      await client.query('UPDATE sale_items SET cost_price = $1 WHERE id = $2', [
        actualLineCost / qty,
        saleItem.rows[0].id,
      ]);
      await client.query(
        `INSERT INTO stock_movements (
           product_id, from_warehouse_id, movement_type, quantity,
           reference_type, reference_id, user_id, notes, unit_cost, total_cost
         ) VALUES ($1,$2,'sale',$3,'sale',$4,$5,$6,$7,$8)`,
        [
          it.product_id,
          warehouseId,
          qty,
          saleId,
          userId,
          `صرف مبيعات مباشر${estimatedQuantity > 0 ? ` (تكلفة تقديرية لكمية ${estimatedQuantity})` : ''}`,
          actualLineCost / qty,
          actualLineCost,
        ],
      );
    }
  }
  return roundMoney(costAmount);
};

/**
 * استرجاع المخزون لعملية بيع (إرجاع/تعديل/حذف): يُعيد كميات الوصفات
 * أولًا ثم الكميات الفعلية المخصومة من مخازنها (من stock_movements) مع fallback.
 * @param {import('pg').PoolClient} client عميل المعاملة
 * @param {number} saleId معرف البيع
 * @param {number} userId معرف المستخدم المنفّذ
 * @returns {Promise<void>}
 */
const restoreInventoryForSale = async (
  client: import('pg').PoolClient,
  saleId: number,
  userId: number,
) => {
  const sale = (await client.query(`SELECT warehouse_id FROM sales WHERE id = $1`, [saleId]))
    .rows[0];
  if (!sale) return;
  // Manual invoices deduct stock under reference_type='invoice'. Restore those
  // actual warehouses before considering the legacy sale-items fallback.
  const linkedInvoices = (
    await client.query(
      `SELECT i.id, i.invoice_number FROM invoices i
     WHERE i.sale_id = $1 AND EXISTS (
       SELECT 1 FROM stock_movements m WHERE m.reference_type = 'invoice'
         AND m.reference_id = i.id AND m.movement_type = 'sale')
     ORDER BY i.id FOR UPDATE`,
      [saleId],
    )
  ).rows;
  if (linkedInvoices.length) {
    const { restoreInvoiceInventory, getInvoiceWarehouseScope } =
      await import('./invoiceService.ts');
    const allowed = await getInvoiceWarehouseScope(client, userId);
    for (const invoice of linkedInvoices) {
      await restoreInvoiceInventory(client, invoice.id, userId, invoice.invoice_number, allowed);
    }
    const saleMovements = await client.query(
      `SELECT 1 FROM stock_movements WHERE reference_type = 'sale'
       AND reference_id = $1 AND movement_type = 'sale' LIMIT 1`,
      [saleId],
    );
    if (!saleMovements.rows.length) return;
  }
  const items = (await client.query(`SELECT * FROM sale_items WHERE sale_id = $1`, [saleId])).rows;
  if (!items.length) return;

  // تصنيف الاسترداد من حركات البيع الأصلية، لا من تعريف الوصفة الحالي.
  const productIds = [...new Set(items.map((item) => Number(item.product_id)))];
  const recipesRes = await client.query(
    `SELECT candidate.id AS product_id FROM unnest($2::int[]) AS candidate(id)
    WHERE EXISTS (SELECT 1 FROM stock_movements sm WHERE sm.reference_type = 'sale' AND sm.reference_id = $1
      AND sm.movement_type = 'consumption' AND (sm.notes = 'استهلاك وصفة المنتج ' || candidate.id::text
      OR sm.notes LIKE 'استهلاك وصفة المنتج ' || candidate.id::text || ' %')
      AND (sm.voided_at IS NULL OR NOT EXISTS (SELECT 1 FROM stock_movements direct
        WHERE direct.reference_type = 'sale' AND direct.reference_id = $1 AND direct.movement_type = 'sale'
          AND direct.product_id = candidate.id AND direct.voided_at IS NULL)))
    OR (EXISTS (SELECT 1 FROM product_recipes r WHERE r.product_id = candidate.id AND r.deleted_at IS NULL AND r.is_active = TRUE)
      AND NOT EXISTS (SELECT 1 FROM stock_movements sm WHERE sm.reference_type = 'sale' AND sm.reference_id = $1
      AND sm.movement_type = 'sale' AND sm.product_id = candidate.id))`,
    [saleId, productIds],
  );
  const recipeProductIds = new Set(recipesRes.rows.map((row) => Number(row.product_id)));

  // استرجاع وصفات المنتجات المركبة أولاً
  for (const item of items) {
    if (recipeProductIds.has(Number(item.product_id))) {
      await recipesService.restoreRecipeConsumptionForProduct(client, {
        productId: item.product_id,
        soldQty: item.quantity,
        saleId,
        warehouseId: sale.warehouse_id,
        userId,
      });
    }
  }

  // استرجاع المنتجات غير المركبة بناءً على المخازن الفعلية التي خُصمت منها
  // يُقرأ فقط الحركات النشطة (غير الملغاة) لمنع الاحتساب المزدوج عند التعديل/الإرجاع المتكرر
  const originalMovements = (
    await client.query(
      `SELECT id, product_id, from_warehouse_id, quantity, unit_cost, total_cost
     FROM stock_movements
     WHERE reference_type = 'sale' AND reference_id = $1 AND movement_type = 'sale'
       AND voided_at IS NULL AND product_id != ALL($2::int[])`,
      [saleId, Array.from(recipeProductIds)],
    )
  ).rows;

  const anySaleMovements =
    (
      await client.query(
        `SELECT 1 FROM stock_movements
       WHERE reference_type = 'sale' AND reference_id = $1 AND movement_type = 'sale'
       LIMIT 1`,
        [saleId],
      )
    ).rows.length > 0;

  const allowedWarehouses = await getAllowedWarehouses(userId, client);
  const itemCost = (productId: number) => {
    const matching = items.filter((item) => Number(item.product_id) === Number(productId));
    let quantity = 0;
    let value = 0;
    for (const item of matching) {
      const qty = Number(item.quantity);
      const cost = Number(item.cost_price);
      if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(cost) || cost < 0)
        throw new AppError('تكلفة بند البيع الأصلية غير صالحة للاسترداد', 409);
      quantity += qty;
      value += qty * cost;
    }
    if (!quantity || !Number.isFinite(value))
      throw new AppError('لا توجد تكلفة بند أصلية صالحة للاسترداد', 409);
    return value / quantity;
  };
  const restorePlainProduct = async (
    productId: number,
    warehouseId: number,
    quantity: number,
    totalCost: number,
    sourceType: string,
    note: string,
  ) => {
    if (!allowedWarehouses.includes(Number(warehouseId)))
      throw new AppError('مخزن الصرف الأصلي خارج نطاق صلاحيات المستخدم', 403);
    const units = Math.round(quantity * 1000);
    if (
      !Number.isSafeInteger(units) ||
      units <= 0 ||
      Math.abs(quantity * 1000 - units) > 0.000001 ||
      !Number.isFinite(totalCost) ||
      totalCost < 0
    )
      throw new AppError('كمية أو تكلفة الاسترداد غير صالحة', 409);
    const cost = roundMoney(totalCost);
    const unitCost = cost / quantity;
    await client.query(
      `INSERT INTO inventory (product_id, warehouse_id, quantity) VALUES ($1,$2,$3)
      ON CONFLICT (product_id, warehouse_id, COALESCE(batch_number, ''))
      DO UPDATE SET quantity = inventory.quantity + EXCLUDED.quantity, updated_at = NOW()`,
      [productId, warehouseId, quantity],
    );
    const movement = await client.query(
      `INSERT INTO stock_movements
      (product_id, to_warehouse_id, movement_type, quantity, reference_type, reference_id, user_id, notes, unit_cost, total_cost)
      VALUES ($1,$2,'return',$3,'sale',$4,$5,$6,$7,$8) RETURNING id`,
      [productId, warehouseId, quantity, saleId, userId, note, unitCost, cost],
    );
    await client.query(
      `INSERT INTO inventory_cost_layers
      (product_id, warehouse_id, source_movement_id, source_type, quantity, remaining_quantity, unit_cost, total_cost)
      VALUES ($1,$2,$3,$4,$5,$5,$6,$7)`,
      [productId, warehouseId, movement.rows[0].id, sourceType, quantity, unitCost, cost],
    );
  };

  if (originalMovements.length > 0) {
    // تعليم الحركات المقروءة كملغاة داخل نفس المعاملة حتى لا تُسترجع مرة أخرى
    await client.query(`UPDATE stock_movements SET voided_at = NOW() WHERE id = ANY($1::int[])`, [
      originalMovements.map((m) => m.id),
    ]);
    for (const mov of originalMovements) {
      const targetWh = mov.from_warehouse_id || sale.warehouse_id;
      const qty = Number(mov.quantity);
      const movementCost = Number(mov.total_cost);
      const movementUnitCost = Number(mov.unit_cost);
      if (
        !Number.isFinite(movementCost) ||
        movementCost < 0 ||
        !Number.isFinite(movementUnitCost) ||
        movementUnitCost < 0
      ) {
        throw new AppError('تكلفة حركة البيع الأصلية غير صالحة', 409);
      }
      const recorded = movementCost > 0 || movementUnitCost > 0;
      const restoredCost = recorded
        ? movementCost > 0
          ? movementCost
          : qty * movementUnitCost
        : qty * itemCost(Number(mov.product_id));
      await restorePlainProduct(
        Number(mov.product_id),
        Number(targetWh),
        qty,
        restoredCost,
        recorded ? 'sale_return_recorded' : 'sale_return_estimated',
        `استرداد مخزون عملية بيع${recorded ? '' : ' (تكلفة تقديرية من بند البيع الأصلي)'}`,
      );
    }
  } else if (anySaleMovements) {
    // كل حركات البيع لهذه العملية ملغاة مسبقًا ← تم استرجاعها من قبل، لا شيء يُفعل
  } else {
    // fallback إذا لم توجد حركات مخزنية مفصلة (بيانات قديمة)
    for (const item of items) {
      if (!recipeProductIds.has(Number(item.product_id))) {
        await restorePlainProduct(
          Number(item.product_id),
          Number(sale.warehouse_id),
          Number(item.quantity),
          Number(item.quantity) * itemCost(Number(item.product_id)),
          'sale_return_estimated',
          'استرداد مخزون بيع قديم (تكلفة تقديرية من بند البيع الأصلي)',
        );
        // شاهد (tombstone): يمنع تكرار الـ fallback لاحقًا لأن الحركة الأصلية غير موجودة
        await client.query(
          `INSERT INTO stock_movements (
             product_id, from_warehouse_id, movement_type, quantity,
             reference_type, reference_id, user_id, notes, voided_at
           ) VALUES ($1,$2,'sale',$3,'sale',$4,$5,'\u0642\u064A\u062F \u0645\u0631\u062C\u0639\u064A \u0644\u0627\u0633\u062A\u0631\u062F\u0627\u062F fallback',NOW())`,
          [item.product_id, sale.warehouse_id, item.quantity, saleId, userId],
        );
      }
    }
  }
};

export { applySaleItems, resolveSaleWarehouseId, restoreInventoryForSale };
