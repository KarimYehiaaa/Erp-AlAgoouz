/**
 * saleInventoryOps.ts — عمليات المخزون المرتبطة بدورة المبيعات
 * ═════════════════════════════════════════════════════════
 * منطق المخزون استُخرج من salesService.ts لتقليل حجم الملف المركزي:
 *  - resolveSaleWarehouseId   : تحديد مخزن البيع تلقائيًا (أساسي/مشترك/افتراضي)
 *  - applySaleItems           : تطبيق أصناف البيع على المخزون (قفل + خصم + حركات)
 *  - restoreInventoryForSale  : استرجاع المخزون عند الإرجاع/التعديل/الحذف
 * كل الدوال تعمل داخل معاملة (client) يوفّرها المتصل.
 */
import { query } from '../database/pool.ts';
import { AppError } from '../types/errors.ts';
import * as recipesService from './recipesService.ts';
import { getProductsEffectiveCosts } from './productCostService.ts';
import * as inventoryService from './inventoryService.ts';
import { getDefaultWarehouseId } from './warehouseService.ts';
import { roundMoney, sumMoney } from '../utils/money.ts';

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
  const globalStocksRes = await client.query(
    `SELECT product_id, COALESCE(SUM(quantity), 0) AS total 
     FROM inventory WHERE product_id = ANY($1::int[]) GROUP BY product_id`,
    [productIds],
  );
  const globalStockMap = new Map(
    globalStocksRes.rows.map((r) => [Number(r.product_id), Number(r.total)]),
  );
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
       FOR UPDATE`,
      [warehouseId, sortedIds],
    );
  }
  const warehousesRes = await client.query(
    `SELECT id FROM warehouses WHERE id <> $1 AND deleted_at IS NULL AND is_active = TRUE ORDER BY id`,
    [warehouseId],
  );
  const candidateWarehouseIds = warehousesRes.rows.map((w) => Number(w.id));
  // ترتيب العناصر تصاعدياً بناءً على product_id لمنع Deadlock عند القفل المتزامن
  const sortedItems = [...items].sort((a, b) => Number(a.product_id) - Number(b.product_id));
  for (const it of sortedItems) {
    const qty = Number(it.quantity || 0);
    const unitPrice = Number(it.unit_price || 0);
    const lineTotal = it.total_amount;
    const effectiveCost = costsMap.get(Number(it.product_id)) || { cost: 0 };
    const costPrice = roundMoney(Number(effectiveCost.cost || 0) * qty);
    costAmount = sumMoney(costAmount, costPrice);
    await client.query(
      `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, cost_price, discount_amount, tax_amount, total_amount)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        saleId,
        it.product_id,
        qty,
        unitPrice,
        costPrice,
        it.discount_amount || 0,
        it.tax_amount || 0,
        lineTotal,
      ],
    );
    if (recipeSet.has(Number(it.product_id))) {
      await recipesService.consumeRecipeForSale(client, {
        productId: it.product_id,
        soldQty: qty,
        warehouseId,
        referenceType: 'sale',
        referenceId: saleId,
        userId,
      });
    } else {
      const globalTotal = Number(globalStockMap.get(Number(it.product_id))) || 0;
      if (globalTotal < qty) {
        const pName =
          productNamesMap.get(Number(it.product_id)) || '\u0627\u0644\u0645\u0646\u062A\u062C';
        throw new AppError(
          `\u0644\u0627 \u064A\u0648\u062C\u062F \u0645\u062E\u0632\u0648\u0646 \u0643\u0627\u0641\u064D \u0643\u0644\u064A \u0644\u0644\u0645\u0646\u062A\u062C ${pName} \u0639\u0628\u0631 \u062C\u0645\u064A\u0639 \u0627\u0644\u0645\u062E\u0627\u0632\u0646. \u0627\u0644\u0645\u0637\u0644\u0648\u0628 ${qty} \u0648\u0627\u0644\u0645\u062A\u0627\u062D \u0643\u0644\u064A\u0627\u064B ${globalTotal}`,
        );
      }
      let remainingNeeded = qty;
      const primaryLock = await client.query(
        `SELECT quantity FROM inventory WHERE product_id = $1 AND warehouse_id = $2 FOR UPDATE`,
        [it.product_id, warehouseId],
      );
      const primaryQty = Number(primaryLock.rows[0]?.quantity || 0);
      if (primaryQty > 0) {
        const deductQty = Math.min(primaryQty, remainingNeeded);
        await client.query(
          `UPDATE inventory SET quantity = quantity - $1, updated_at = NOW()
           WHERE product_id = $2 AND warehouse_id = $3`,
          [deductQty, it.product_id, warehouseId],
        );
        await client.query(
          `INSERT INTO stock_movements (
             product_id, from_warehouse_id, movement_type, quantity,
             reference_type, reference_id, user_id, notes
           ) VALUES ($1,$2,'sale',$3,'sale',$4,$5,'\u0635\u0631\u0641 \u0645\u0628\u064A\u0639\u0627\u062A \u0645\u0628\u0627\u0634\u0631 - \u0645\u062E\u0632\u0646 \u0631\u0626\u064A\u0633\u064A')`,
          [it.product_id, warehouseId, deductQty, saleId, userId],
        );
        remainingNeeded -= deductQty;
      }
      if (remainingNeeded > 1e-4) {
        for (const candidateWarehouseId of candidateWarehouseIds) {
          if (remainingNeeded <= 0) break;
          await inventoryService.ensureInventoryRow(client, it.product_id, candidateWarehouseId);
          const otherLock = await client.query(
            `SELECT quantity FROM inventory WHERE product_id = $1 AND warehouse_id = $2 FOR UPDATE`,
            [it.product_id, candidateWarehouseId],
          );
          const otherQty = Number(otherLock.rows[0]?.quantity || 0);
          if (otherQty > 0) {
            const deductQty = Math.min(otherQty, remainingNeeded);
            await client.query(
              `UPDATE inventory SET quantity = quantity - $1, updated_at = NOW()
               WHERE product_id = $2 AND warehouse_id = $3`,
              [deductQty, it.product_id, candidateWarehouseId],
            );
            await client.query(
              `INSERT INTO stock_movements (
                 product_id, from_warehouse_id, movement_type, quantity,
                 reference_type, reference_id, user_id, notes
               ) VALUES ($1,$2,'sale',$3,'sale',$4,$5,'\u0635\u0631\u0641 \u0645\u0628\u064A\u0639\u0627\u062A \u0645\u0628\u0627\u0634\u0631 - \u0645\u062E\u0632\u0646 \u0645\u0633\u0627\u0639\u062F')`,
              [it.product_id, candidateWarehouseId, deductQty, saleId, userId],
            );
            remainingNeeded -= deductQty;
          }
        }
      }
      if (remainingNeeded > 1e-4) {
        const pName =
          productNamesMap.get(Number(it.product_id)) || '\u0627\u0644\u0645\u0646\u062A\u062C';
        throw new AppError(
          `\u062A\u0639\u0630\u0631 \u0633\u062D\u0628 \u0627\u0644\u0643\u0645\u064A\u0629 \u0628\u0627\u0644\u0643\u0627\u0645\u0644 \u0644\u0644\u0645\u0646\u062A\u062C ${pName} \u0628\u0633\u0628\u0628 \u062A\u063A\u064A\u0631 \u0627\u0644\u0645\u062E\u0632\u0648\u0646 \u0641\u064A \u0647\u0630\u0647 \u0627\u0644\u0644\u062D\u0638\u0629`,
        );
      }
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
  const items = (await client.query(`SELECT * FROM sale_items WHERE sale_id = $1`, [saleId])).rows;
  if (!items.length) return;

  // جلب كل المنتجات التي لها وصفات بأستعلام واحد (بدلاً من N+1)
  const productIds = items.map((i) => i.product_id);
  const recipesRes = await client.query(
    `SELECT DISTINCT product_id FROM product_recipes WHERE product_id = ANY($1::int[]) AND deleted_at IS NULL AND is_active = TRUE`,
    [productIds],
  );
  const recipeProductIds = new Set(recipesRes.rows.map((r) => Number(r.product_id)));

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
      `SELECT id, product_id, from_warehouse_id, quantity
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

  if (originalMovements.length > 0) {
    // تعليم الحركات المقروءة كملغاة داخل نفس المعاملة حتى لا تُسترجع مرة أخرى
    await client.query(`UPDATE stock_movements SET voided_at = NOW() WHERE id = ANY($1::int[])`, [
      originalMovements.map((m) => m.id),
    ]);
    for (const mov of originalMovements) {
      const targetWh = mov.from_warehouse_id || sale.warehouse_id;
      await client.query(
        `INSERT INTO inventory (product_id, warehouse_id, quantity) VALUES ($1,$2,$3)
         ON CONFLICT (product_id, warehouse_id, COALESCE(batch_number, ''))
         DO UPDATE SET quantity = inventory.quantity + $3, updated_at = NOW()`,
        [mov.product_id, targetWh, mov.quantity],
      );
      await client.query(
        `INSERT INTO stock_movements (
           product_id, to_warehouse_id, movement_type, quantity,
           reference_type, reference_id, user_id, notes
         ) VALUES ($1,$2,'return',$3,'sale',$4,$5,'\u0627\u0633\u062A\u0631\u062F\u0627\u062F \u0645\u062E\u0632\u0648\u0646 \u0639\u0645\u0644\u064A\u0629 \u0628\u064A\u0639')`,
        [mov.product_id, targetWh, mov.quantity, saleId, userId],
      );
    }
  } else if (anySaleMovements) {
    // كل حركات البيع لهذه العملية ملغاة مسبقًا ← تم استرجاعها من قبل، لا شيء يُفعل
  } else {
    // fallback إذا لم توجد حركات مخزنية مفصلة (بيانات قديمة)
    for (const item of items) {
      if (!recipeProductIds.has(Number(item.product_id))) {
        await client.query(
          `INSERT INTO inventory (product_id, warehouse_id, quantity) VALUES ($1,$2,$3)
           ON CONFLICT (product_id, warehouse_id, COALESCE(batch_number, ''))
           DO UPDATE SET quantity = inventory.quantity + $3, updated_at = NOW()`,
          [item.product_id, sale.warehouse_id, item.quantity],
        );
        await client.query(
          `INSERT INTO stock_movements (
             product_id, to_warehouse_id, movement_type, quantity,
             reference_type, reference_id, user_id, notes
           ) VALUES ($1,$2,'return',$3,'sale',$4,$5,'\u0627\u0633\u062A\u0631\u062F\u0627\u062D \u0645\u062E\u0632\u0648\u0646 \u0639\u0645\u0644\u064A\u0629 \u0628\u064A\u0639')`,
          [item.product_id, sale.warehouse_id, item.quantity, saleId, userId],
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
