/**
 * purchaseReturnService.ts — خدمة إدارة مرتجعات المشتريات (Purchase Returns / Debit Notes)
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * تغطي:
 *  - إنشاء مرتجع مشتريات لمورد مع فحص كميات الفاتورة الأصلية ومنع الإرجاع الزائد
 *  - خصم الكميات المرتجعة من المخزون وتسجيل حركة مخزنية رسمية
 *  - تسوية رصيد المورد التراكمي
 *  - الترحيل المحاسبي التلقائي للقيد العكسي (مدين: الموردون، دائن: المخزون)
 *  - استعراض المرتجعات وتفاصيلها
 */

import { query, getClient } from '../database/pool.ts';
import { AppError } from '../types/errors.ts';
import { roundMoney, sumMoney, sanitizeLimit } from '../utils/money.ts';
import { recalculateSupplierBalance } from './supplierService.ts';
import { accountingService } from './accountingService.ts';
import { getInvoiceWarehouseScope } from './invoiceService.ts';
import { businessToday, isCalendarDate } from '../utils/localDate.ts';
import { depleteInventoryCostLayers } from './productCostService.ts';

export interface PurchaseReturnItemInput {
  purchase_invoice_item_id?: number;
  product_id: number;
  quantity: number;
  unit_price?: number;
  notes?: string;
}

export interface CreatePurchaseReturnInput {
  purchase_invoice_id: number;
  return_date?: string;
  items: PurchaseReturnItemInput[];
  notes?: string;
}

const generateReturnNumber = async (client: any): Promise<string> => {
  const yy = new Date().getFullYear();
  const res = await client.query(`SELECT nextval('seq_purchase_returns_number') AS n`);
  return `PR-${yy}-${String(res.rows[0].n).padStart(4, '0')}`;
};

export const purchaseReturnService = {
  /**
   * إنشاء مرتجع مشتريات جديد مع حماية المعاملة والتزامن
   */
  async createPurchaseReturn(userId: number, payload: CreatePurchaseReturnInput) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload))
      throw new AppError('بيانات المرتجع غير صحيحة', 400);
    const invoiceId = Number(payload.purchase_invoice_id);
    if (!Number.isSafeInteger(invoiceId) || invoiceId <= 0)
      throw new AppError('معرف فاتورة الشراء مطلوب لإجراء المرتجع', 400);
    const retDate = payload.return_date ?? businessToday();
    if (!isCalendarDate(retDate) || retDate.startsWith('0000-'))
      throw new AppError('تاريخ المرتجع غير صحيح', 400);
    if (payload.notes != null && typeof payload.notes !== 'string')
      throw new AppError('ملاحظات المرتجع غير صحيحة', 400);

    const items = Array.isArray(payload.items) ? payload.items : [];
    if (!items.length) throw new AppError('يجب تحديد صنف واحد على الأقل للإرجاع', 400);
    if (items.length > 500) throw new AppError('الحد الأقصى لبنود المرتجع 500 بند', 400);

    const client = await getClient();
    try {
      await client.query('BEGIN');

      // 1. قفل وسحب فاتورة الشراء الأصلية
      const invRes = await client.query(
        `SELECT * FROM purchase_invoices WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
        [invoiceId],
      );
      const invoice = invRes.rows[0];
      if (!invoice) throw new AppError('فاتورة الشراء الأصلية غير موجودة أو تم حذفها', 404);

      const supplierId = invoice.supplier_id ? Number(invoice.supplier_id) : null;
      let warehouseId = Number(invoice.warehouse_id);
      if (!Number.isSafeInteger(warehouseId) || warehouseId <= 0)
        throw new AppError(
          'فاتورة الشراء بلا مخزن محدد؛ يلزم مراجعة مصدر المخزون قبل المرتجع',
          409,
        );
      const allowed = await getInvoiceWarehouseScope(client, userId);

      // 2. جلب بنود الفاتورة الأصلية وما تم إرجاعه منها مسبقاً
      const origItemsRes = await client.query(
        `SELECT pii.*,
                COALESCE((
                  SELECT SUM(pri.quantity)
                  FROM purchase_return_items pri
                  JOIN purchase_returns pr ON pr.id = pri.purchase_return_id
                  WHERE pri.purchase_invoice_item_id = pii.id
                    AND pr.status = 'completed'
                    AND pr.deleted_at IS NULL
                ), 0)::numeric AS already_returned_qty
         FROM purchase_invoice_items pii
         WHERE pii.purchase_invoice_id = $1`,
        [invoiceId],
      );

      const origItemsByItemMap = new Map<number, any>();
      const origItemsByProductMap = new Map<number, any[]>();
      for (const row of origItemsRes.rows) {
        origItemsByItemMap.set(Number(row.id), row);
        const productId = Number(row.product_id);
        origItemsByProductMap.set(productId, [
          ...(origItemsByProductMap.get(productId) || []),
          row,
        ]);
      }

      const cumulativeRequested = new Map<number, number>();
      const stockRequested = new Map<
        string,
        { productId: number; warehouseId: number; quantityUnits: number }
      >();
      let returnSubtotal = 0;
      const validatedItems: Array<{
        product_id: number;
        warehouse_id: number;
        product_name: string;
        purchase_invoice_item_id: number | null;
        quantity: number;
        unit_price: number;
        line_total: number;
        fallback_unit_cost: number;
        notes?: string;
      }> = [];

      // 3. التحقق من كل بند مراد إرجاعه بدقة على مستوى السطر
      for (const item of items) {
        if (!item || typeof item !== 'object')
          throw new AppError('بيانات بند المرتجع غير صحيحة', 400);
        const productId = Number(item.product_id);
        const returnQty = Number(item.quantity);

        const quantityUnits = Math.round(returnQty * 1000);
        if (
          !Number.isSafeInteger(productId) ||
          productId <= 0 ||
          !Number.isFinite(returnQty) ||
          returnQty <= 0 ||
          !Number.isSafeInteger(quantityUnits) ||
          quantityUnits <= 0 ||
          Math.abs(returnQty * 1000 - quantityUnits) > 1e-7
        ) {
          throw new AppError('بيانات الأصناف والكميات المرتجعة غير صحيحة', 400);
        }

        let origItem: any = null;
        if (item.purchase_invoice_item_id != null) {
          origItem = origItemsByItemMap.get(Number(item.purchase_invoice_item_id));
          if (!origItem || Number(origItem.product_id) !== productId)
            throw new AppError('بند الفاتورة لا يطابق المنتج المطلوب إرجاعه', 400);
        } else {
          const candidates = origItemsByProductMap.get(productId) || [];
          if (candidates.length > 1)
            throw new AppError('المنتج مكرر في الفاتورة؛ حدد معرف البند المطلوب إرجاعه', 400);
          origItem = candidates[0];
        }

        if (!origItem) {
          throw new AppError(`الصنف رقم ${productId} غير موجود ضمن فاتورة الشراء الأصلية`, 400);
        }
        const itemWarehouseId = Number(origItem.warehouse_id || invoice.warehouse_id);
        if (!Number.isSafeInteger(itemWarehouseId) || itemWarehouseId <= 0)
          throw new AppError('بند الشراء بلا مخزن قابل للتحديد', 409);
        if (allowed && !allowed.includes(itemWarehouseId))
          throw new AppError('غير مصرح لك بمرتجع بند هذا المخزن', 403);

        const purchasedQty = Math.round(Number(origItem.quantity) * 1000);
        const alreadyReturned = Math.round(Number(origItem.already_returned_qty || 0) * 1000);
        const priorInBatch = cumulativeRequested.get(origItem.id) || 0;
        const totalPendingReturn = priorInBatch + quantityUnits;
        const maxReturnable = purchasedQty - alreadyReturned;

        if (totalPendingReturn > maxReturnable) {
          throw new AppError(
            `الكمية المراد إرجاعها (${returnQty}) تتجاوز الكمية المتبقية القابلة للإرجاع (${maxReturnable / 1000}) للبند`,
            400,
          );
        }

        cumulativeRequested.set(origItem.id, totalPendingReturn);
        const stockKey = `${productId}:${itemWarehouseId}`;
        const previousStock = stockRequested.get(stockKey);
        stockRequested.set(stockKey, {
          productId,
          warehouseId: itemWarehouseId,
          quantityUnits: (previousStock?.quantityUnits || 0) + quantityUnits,
        });

        const unitPrice =
          item.unit_price !== undefined ? Number(item.unit_price) : Number(origItem.unit_price);
        if (!Number.isFinite(unitPrice) || unitPrice < 0)
          throw new AppError('سعر بند المرتجع غير صحيح', 400);
        const lineTotal = roundMoney(returnQty * unitPrice);
        returnSubtotal = sumMoney(returnSubtotal, lineTotal);
        if (!Number.isFinite(returnSubtotal))
          throw new AppError('إجمالي المرتجع يتجاوز الحد المالي المقبول', 400);

        validatedItems.push({
          product_id: productId,
          warehouse_id: itemWarehouseId,
          product_name: origItem.name_ar || '',
          purchase_invoice_item_id: origItem.id,
          quantity: returnQty,
          unit_price: unitPrice,
          line_total: lineTotal,
          fallback_unit_cost: Number(origItem.unit_price),
          notes: item.notes,
        });
      }

      // Check the total across every occurrence before any deduction, in a stable lock order.
      const stockEntries = [...stockRequested.values()].sort(
        (a, b) => a.productId - b.productId || a.warehouseId - b.warehouseId,
      );
      const stockRows = new Map<string, Array<{ id: number; units: number }>>();
      for (const { productId, warehouseId: itemWarehouseId, quantityUnits } of stockEntries) {
        const stock = await client.query(
          'SELECT id, quantity FROM inventory WHERE product_id = $1 AND warehouse_id = $2 ORDER BY id FOR UPDATE',
          [productId, itemWarehouseId],
        );
        const rows = stock.rows.map((row) => ({
          id: Number(row.id),
          units: Math.round(Number(row.quantity) * 1000),
        }));
        if (rows.some((row) => !Number.isSafeInteger(row.units) || row.units < 0))
          throw new AppError('رصيد دفعات المخزون يحتاج مراجعة قبل المرتجع', 409);
        const availableUnits = rows.reduce((total, row) => total + row.units, 0);
        stockRows.set(`${productId}:${itemWarehouseId}`, rows);
        if (availableUnits < quantityUnits)
          throw new AppError(
            `رصيد المنتج ${productId} (${availableUnits / 1000}) لا يكفي لإجمالي المرتجع (${quantityUnits / 1000})`,
            400,
          );
      }
      // The header is a representative warehouse; every physical movement uses its original item warehouse.
      warehouseId = stockEntries[0].warehouseId;

      // 4. إنشاء سجل المرتجع الرئيسي
      const returnNumber = await generateReturnNumber(client);

      const retRes = await client.query(
        `INSERT INTO purchase_returns (return_number, purchase_invoice_id, supplier_id, warehouse_id, return_date, subtotal, tax_amount, total_amount, status, notes, created_by)
         VALUES ($1, $2, $3, $4, $5::date, $6, 0, $6, 'completed', $7, $8)
         RETURNING *`,
        [
          returnNumber,
          invoiceId,
          supplierId,
          warehouseId,
          retDate,
          returnSubtotal,
          payload.notes?.trim() || null,
          userId,
        ],
      );
      const createdReturn = retRes.rows[0];
      const warehouseAmounts = new Map<
        number,
        { warehouse_id: number; supplier_amount: number; inventory_cost: number }
      >();

      // 5. إدراج بنود المرتجع وخصم المخزون
      for (const vItem of validatedItems) {
        await client.query(
          `INSERT INTO purchase_return_items (purchase_return_id, purchase_invoice_item_id, product_id, quantity, unit_price, total_amount, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            createdReturn.id,
            vItem.purchase_invoice_item_id,
            vItem.product_id,
            vItem.quantity,
            vItem.unit_price,
            vItem.line_total,
            vItem.notes || null,
          ],
        );

        // Deduct across locked batch rows once, rather than subtracting the full quantity from every row.
        let unitsToDeduct = Math.round(vItem.quantity * 1000);
        for (const row of stockRows.get(`${vItem.product_id}:${vItem.warehouse_id}`) || []) {
          if (unitsToDeduct <= 0) break;
          const take = Math.min(row.units, unitsToDeduct);
          if (take <= 0) continue;
          await client.query(
            'UPDATE inventory SET quantity = quantity - $1, updated_at = NOW() WHERE id = $2',
            [take / 1000, row.id],
          );
          row.units -= take;
          unitsToDeduct -= take;
        }
        if (unitsToDeduct)
          throw new AppError('تعذر خصم كمية المرتجع كاملة؛ أعد مراجعة رصيد الدفعات', 409);
        const consumed = await depleteInventoryCostLayers(
          client,
          vItem.product_id,
          vItem.warehouse_id,
          vItem.quantity,
        );
        if (!Number.isFinite(vItem.fallback_unit_cost) || vItem.fallback_unit_cost < 0)
          throw new AppError('تكلفة بند الشراء الأصلية غير صحيحة', 409);
        const missingLayerQuantity = Math.max(
          0,
          Math.round((vItem.quantity - consumed.quantity) * 1000) / 1000,
        );
        const inventoryCost = roundMoney(
          consumed.cost + missingLayerQuantity * vItem.fallback_unit_cost,
        );
        const amount = warehouseAmounts.get(vItem.warehouse_id) || {
          warehouse_id: vItem.warehouse_id,
          supplier_amount: 0,
          inventory_cost: 0,
        };
        amount.supplier_amount = sumMoney(amount.supplier_amount, vItem.line_total);
        amount.inventory_cost = sumMoney(amount.inventory_cost, inventoryCost);
        warehouseAmounts.set(vItem.warehouse_id, amount);

        // تسجيل حركة مخزنية
        await client.query(
          `INSERT INTO stock_movements (product_id, from_warehouse_id, movement_type, quantity, reference_type, reference_id, user_id, notes, unit_cost, total_cost)
           VALUES ($1, $2, 'return', $3, 'purchase_return', $4, $5, $6, $7, $8)`,
          [
            vItem.product_id,
            vItem.warehouse_id,
            vItem.quantity,
            createdReturn.id,
            userId,
            `مرتجع مشتريات رقم ${returnNumber} للمورد${missingLayerQuantity > 0 ? ' — تكلفة الجزء بلا طبقة مقدرة بسعر الشراء الأصلي' : ''}`,
            inventoryCost / vItem.quantity,
            inventoryCost,
          ],
        );
      }

      // 6. تسوية وتحديث رصيد المورد
      if (supplierId) {
        await recalculateSupplierBalance(client, supplierId);
      }

      // 7. الترحيل المحاسبي التلقائي للقيد المزدوج العكسي
      await accountingService.postPurchaseReturnJournalEntry(client, {
        id: createdReturn.id,
        return_number: returnNumber,
        total_amount: returnSubtotal,
        warehouse_amounts: [...warehouseAmounts.values()],
        return_date: retDate,
        supplier_id: supplierId || undefined,
        warehouse_id: warehouseId,
        user_id: userId,
      });

      // 8. سجل الأنشطة والتدقيق
      await client.query(
        `INSERT INTO activity_logs (user_id, module, action_ar, details)
         VALUES ($1, 'purchases', $2, $3)`,
        [
          userId,
          `مرتجع مشتريات ${returnNumber}`,
          JSON.stringify({
            return_id: createdReturn.id,
            invoice_id: invoiceId,
            total: returnSubtotal,
          }),
        ],
      );

      await client.query('COMMIT');

      return {
        ...createdReturn,
        items: validatedItems,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  /**
   * استعراض قائمة مرتجعات المشتريات مع الفلاتر
   */
  async getPurchaseReturns(
    filters: {
      supplier_id?: number;
      purchase_invoice_id?: number;
      warehouse_id?: number;
      from_date?: string;
      to_date?: string;
      limit?: number;
      offset?: number;
    } = {},
    userId?: number,
  ) {
    const allowed = await getInvoiceWarehouseScope({ query }, Number(userId));
    if (allowed && filters.warehouse_id && !allowed.includes(Number(filters.warehouse_id))) {
      throw new AppError('غير مصرح لك بمرتجعات هذا المخزن', 403);
    }
    let sql = `
      SELECT pr.*,
             s.name_ar AS supplier_name,
             w.name_ar AS warehouse_name,
             pi.invoice_number AS purchase_invoice_number,
             COUNT(pri.id)::int AS items_count
      FROM purchase_returns pr
      LEFT JOIN suppliers s ON s.id = pr.supplier_id
      LEFT JOIN warehouses w ON w.id = pr.warehouse_id
      LEFT JOIN purchase_invoices pi ON pi.id = pr.purchase_invoice_id
      LEFT JOIN purchase_return_items pri ON pri.purchase_return_id = pr.id
      WHERE pr.deleted_at IS NULL
    `;
    const params: any[] = [];
    if (allowed) {
      params.push(allowed);
      sql += ` AND pr.warehouse_id = ANY($${params.length}::int[])`;
      sql += ` AND NOT EXISTS (
        SELECT 1 FROM stock_movements movement WHERE movement.reference_type = 'purchase_return'
          AND movement.reference_id = pr.id AND
          (movement.from_warehouse_id IS NULL OR NOT (movement.from_warehouse_id = ANY($${params.length}::int[]))))`;
      sql += ` AND NOT EXISTS (
        SELECT 1 FROM purchase_return_items ri JOIN purchase_invoice_items original ON original.id = ri.purchase_invoice_item_id
        WHERE ri.purchase_return_id = pr.id AND NOT (COALESCE(original.warehouse_id, pr.warehouse_id) = ANY($${params.length}::int[])))`;
    }

    if (filters.supplier_id) {
      params.push(filters.supplier_id);
      sql += ` AND pr.supplier_id = $${params.length}`;
    }
    if (filters.purchase_invoice_id) {
      params.push(filters.purchase_invoice_id);
      sql += ` AND pr.purchase_invoice_id = $${params.length}`;
    }
    if (filters.warehouse_id) {
      params.push(filters.warehouse_id);
      sql += ` AND pr.warehouse_id = $${params.length}`;
    }
    if (filters.from_date) {
      params.push(filters.from_date);
      sql += ` AND pr.return_date >= $${params.length}::date`;
    }
    if (filters.to_date) {
      params.push(filters.to_date);
      sql += ` AND pr.return_date <= $${params.length}::date`;
    }

    sql += ` GROUP BY pr.id, s.name_ar, w.name_ar, pi.invoice_number ORDER BY pr.id DESC`;

    const limit = sanitizeLimit(filters.limit, 50, 500);
    const offset =
      Number.isSafeInteger(filters.offset) && Number(filters.offset) >= 0
        ? Number(filters.offset)
        : 0;
    params.push(limit, offset);
    sql += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const res = await query(sql, params);
    return res.rows;
  },

  /**
   * جلب تفاصيل مرتجع مشتريات محدد مع بنوده
   */
  async getPurchaseReturnById(id: number, userId?: number) {
    const allowed = await getInvoiceWarehouseScope({ query }, Number(userId));
    const res = await query(
      `SELECT pr.*,
              s.name_ar AS supplier_name,
              w.name_ar AS warehouse_name,
              pi.invoice_number AS purchase_invoice_number
       FROM purchase_returns pr
       LEFT JOIN suppliers s ON s.id = pr.supplier_id
       LEFT JOIN warehouses w ON w.id = pr.warehouse_id
       LEFT JOIN purchase_invoices pi ON pi.id = pr.purchase_invoice_id
       WHERE pr.id = $1 AND pr.deleted_at IS NULL`,
      [id],
    );
    const ret = res.rows[0];
    if (!ret) throw new AppError('مرتجع المشتريات غير موجود', 404);
    if (allowed && (!ret.warehouse_id || !allowed.includes(Number(ret.warehouse_id)))) {
      throw new AppError('غير مصرح لك بمرتجعات هذا المخزن', 403);
    }
    if (allowed) {
      const outside = await query(
        `SELECT 1 WHERE EXISTS (
        SELECT 1 FROM stock_movements movement WHERE movement.reference_type = 'purchase_return'
          AND movement.reference_id = $1 AND
          (movement.from_warehouse_id IS NULL OR NOT (movement.from_warehouse_id = ANY($2::int[]))))
        OR EXISTS (SELECT 1 FROM purchase_return_items ri
          JOIN purchase_invoice_items original ON original.id = ri.purchase_invoice_item_id
          WHERE ri.purchase_return_id = $1 AND NOT (COALESCE(original.warehouse_id, $3) = ANY($2::int[])))`,
        [id, allowed, ret.warehouse_id],
      );
      if (outside.rows.length) throw new AppError('المرتجع يشمل مخازن خارج النطاق المصرح به', 403);
    }

    const itemsRes = await query(
      `SELECT pri.*, COALESCE(original.warehouse_id, $2) AS warehouse_id,
              p.name_ar AS product_name, p.code AS product_code, p.unit
       FROM purchase_return_items pri
       JOIN products p ON p.id = pri.product_id
       LEFT JOIN purchase_invoice_items original ON original.id = pri.purchase_invoice_item_id
       WHERE pri.purchase_return_id = $1
       ORDER BY pri.id ASC`,
      [id, ret.warehouse_id],
    );

    return {
      ...ret,
      items: itemsRes.rows,
    };
  },
};
