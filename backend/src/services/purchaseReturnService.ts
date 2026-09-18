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
import { roundMoney, sumMoney } from '../utils/money.ts';
import { recalculateSupplierBalance } from './supplierService.ts';
import { invalidateDashboardCache } from './dashboardService.ts';
import { accountingService } from './accountingService.ts';

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
    const invoiceId = Number(payload.purchase_invoice_id);
    if (!invoiceId) throw new AppError('معرف فاتورة الشراء مطلوب لإجراء المرتجع', 400);

    const items = Array.isArray(payload.items) ? payload.items : [];
    if (!items.length) throw new AppError('يجب تحديد صنف واحد على الأقل للإرجاع', 400);

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
      const warehouseId = invoice.warehouse_id ? Number(invoice.warehouse_id) : 1;

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
      const origItemsByProductMap = new Map<number, any>();
      for (const row of origItemsRes.rows) {
        origItemsByItemMap.set(Number(row.id), row);
        origItemsByProductMap.set(Number(row.product_id), row);
      }

      const cumulativeRequested = new Map<number, number>();
      let returnSubtotal = 0;
      const validatedItems: Array<{
        product_id: number;
        product_name: string;
        purchase_invoice_item_id: number | null;
        quantity: number;
        unit_price: number;
        line_total: number;
        notes?: string;
      }> = [];

      // 3. التحقق من كل بند مراد إرجاعه بدقة على مستوى السطر
      for (const item of items) {
        const productId = Number(item.product_id);
        const returnQty = Number(item.quantity);

        if (!productId || isNaN(returnQty) || returnQty <= 0) {
          throw new AppError('بيانات الأصناف والكميات المرتجعة غير صحيحة', 400);
        }

        let origItem: any = null;
        if (item.purchase_invoice_item_id) {
          origItem = origItemsByItemMap.get(Number(item.purchase_invoice_item_id));
        }
        if (!origItem) {
          origItem = origItemsByProductMap.get(productId);
        }

        if (!origItem) {
          throw new AppError(`الصنف رقم ${productId} غير موجود ضمن فاتورة الشراء الأصلية`, 400);
        }

        const purchasedQty = Number(origItem.quantity);
        const alreadyReturned = Number(origItem.already_returned_qty || 0);
        const priorInBatch = cumulativeRequested.get(origItem.id) || 0;
        const totalPendingReturn = roundMoney(priorInBatch + returnQty);
        const maxReturnable = roundMoney(purchasedQty - alreadyReturned);

        if (totalPendingReturn > maxReturnable) {
          throw new AppError(
            `الكمية المراد إرجاعها (${returnQty}) تتجاوز الكمية المتبقية القابلة للإرجاع (${maxReturnable}) للبند`,
            400,
          );
        }

        cumulativeRequested.set(origItem.id, totalPendingReturn);

        // التحقق من توفر رصيد كافٍ في المخزن للإرجاع
        const stockRes = await client.query(
          `SELECT quantity FROM inventory WHERE product_id = $1 AND warehouse_id = $2 FOR UPDATE`,
          [productId, warehouseId],
        );
        const currentStock = Number(stockRes.rows[0]?.quantity || 0);
        if (currentStock < returnQty) {
          throw new AppError(
            `الرصيد الفعلي الحالي في المخزن (${currentStock}) غير كافٍ لإرجاع كمية (${returnQty}) من الصنف`,
            400,
          );
        }

        const unitPrice =
          item.unit_price !== undefined ? Number(item.unit_price) : Number(origItem.unit_price);
        const lineTotal = roundMoney(returnQty * unitPrice);
        returnSubtotal = sumMoney(returnSubtotal, lineTotal);

        validatedItems.push({
          product_id: productId,
          product_name: origItem.name_ar || '',
          purchase_invoice_item_id: origItem.id,
          quantity: returnQty,
          unit_price: unitPrice,
          line_total: lineTotal,
          notes: item.notes,
        });
      }

      // 4. إنشاء سجل المرتجع الرئيسي
      const returnNumber = await generateReturnNumber(client);
      const retDate = payload.return_date || new Date().toISOString().slice(0, 10);

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

        // خصم المخزون
        await client.query(
          `UPDATE inventory SET quantity = quantity - $1, updated_at = NOW()
           WHERE product_id = $2 AND warehouse_id = $3`,
          [vItem.quantity, vItem.product_id, warehouseId],
        );

        // تسجيل حركة مخزنية
        await client.query(
          `INSERT INTO stock_movements (product_id, from_warehouse_id, movement_type, quantity, reference_type, reference_id, user_id, notes)
           VALUES ($1, $2, 'return', $3, 'purchase_return', $4, $5, $6)`,
          [
            vItem.product_id,
            warehouseId,
            vItem.quantity,
            createdReturn.id,
            userId,
            `مرتجع مشتريات رقم ${returnNumber} للمورد`,
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
      invalidateDashboardCache();

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
  ) {
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

    const limit = filters.limit || 50;
    const offset = filters.offset || 0;
    params.push(limit, offset);
    sql += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const res = await query(sql, params);
    return res.rows;
  },

  /**
   * جلب تفاصيل مرتجع مشتريات محدد مع بنوده
   */
  async getPurchaseReturnById(id: number) {
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

    const itemsRes = await query(
      `SELECT pri.*, p.name_ar AS product_name, p.code AS product_code, p.unit
       FROM purchase_return_items pri
       JOIN products p ON p.id = pri.product_id
       WHERE pri.purchase_return_id = $1
       ORDER BY pri.id ASC`,
      [id],
    );

    return {
      ...ret,
      items: itemsRes.rows,
    };
  },
};
