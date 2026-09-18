/**
 * purchaseOrderService.ts — دورة أوامر الشراء والاستلام المخزني
 * ═════════════════════════════════════════════════════════════
 * إدارة دورة المشتريات التخطيطية:
 * 1. مسودة أمر شراء (Draft PO)
 * 2. اعتماد أمر الشراء (Approved PO)
 * 3. استلام جزئي أو كلي للبضاعة مع زيادة المخزون (Goods Receipt)
 * 4. تحويل الاستلام إلى فاتورة مشتريات وترحيلها محاسبياً للأستاذ العام
 */

import { query, getClient } from '../database/pool.ts';
import { AppError } from '../types/errors.ts';
import { roundMoney } from '../utils/money.ts';
import { getDefaultWarehouseId } from './warehouseService.ts';
import { createPurchaseInvoice } from './purchaseService.ts';

export interface PurchaseOrderItemInput {
  product_id: number;
  quantity: number;
  unit_price: number;
  notes?: string;
}

export interface CreatePurchaseOrderInput {
  supplier_id?: number;
  warehouse_id?: number;
  order_date?: string;
  expected_date?: string;
  notes?: string;
  items: PurchaseOrderItemInput[];
}

export interface ReceiveGoodsItemInput {
  item_id: number;
  quantity_to_receive: number;
}

export interface ReceiveGoodsInput {
  items: ReceiveGoodsItemInput[];
  convertToInvoice?: boolean;
  notes?: string;
}

export const purchaseOrderService = {
  /**
   * جلب قائمة أوامر الشراء مع التفاصيل والفلترة
   */
  async listPurchaseOrders(
    filters: {
      status?: string;
      supplier_id?: number;
      warehouse_id?: number;
      from_date?: string;
      to_date?: string;
      limit?: number;
    } = {},
  ) {
    let sql = `
      SELECT 
        po.*,
        s.name_ar AS supplier_name,
        w.name_ar AS warehouse_name,
        u.full_name AS created_by_name,
        COALESCE((
          SELECT json_agg(json_build_object(
            'id', poi.id,
            'product_id', poi.product_id,
            'product_name', p.name_ar,
            'unit', p.unit,
            'quantity', poi.quantity,
            'received_quantity', poi.received_quantity,
            'remaining_quantity', (poi.quantity - poi.received_quantity),
            'unit_price', poi.unit_price,
            'total_amount', poi.total_amount,
            'notes', poi.notes
          ) ORDER BY poi.id)
          FROM purchase_order_items poi
          JOIN products p ON p.id = poi.product_id
          WHERE poi.purchase_order_id = po.id
        ), '[]'::json) AS items
      FROM purchase_orders po
      LEFT JOIN suppliers s ON s.id = po.supplier_id
      LEFT JOIN warehouses w ON w.id = po.warehouse_id
      LEFT JOIN users u ON u.id = po.created_by
      WHERE 1=1
    `;
    const params: any[] = [];

    if (filters.status) {
      params.push(filters.status);
      sql += ` AND po.status = $${params.length}`;
    }
    if (filters.supplier_id) {
      params.push(filters.supplier_id);
      sql += ` AND po.supplier_id = $${params.length}`;
    }
    if (filters.warehouse_id) {
      params.push(filters.warehouse_id);
      sql += ` AND po.warehouse_id = $${params.length}`;
    }
    if (filters.from_date) {
      params.push(filters.from_date);
      sql += ` AND po.order_date >= $${params.length}::date`;
    }
    if (filters.to_date) {
      params.push(filters.to_date);
      sql += ` AND po.order_date <= $${params.length}::date`;
    }

    const limit = Math.min(Math.max(Number(filters.limit || 50), 1), 200);
    sql += ` ORDER BY po.order_date DESC, po.id DESC LIMIT ${limit}`;

    const res = await query(sql, params);
    return res.rows.map((r: any) => ({
      ...r,
      total_amount: roundMoney(Number(r.total_amount)),
    }));
  },

  /**
   * جلب تفاصيل أمر شراء واحد
   */
  async getPurchaseOrderById(id: number) {
    const sql = `
      SELECT 
        po.*,
        s.name_ar AS supplier_name,
        w.name_ar AS warehouse_name,
        u.full_name AS created_by_name,
        COALESCE((
          SELECT json_agg(json_build_object(
            'id', poi.id,
            'product_id', poi.product_id,
            'product_name', p.name_ar,
            'unit', p.unit,
            'quantity', poi.quantity,
            'received_quantity', poi.received_quantity,
            'remaining_quantity', (poi.quantity - poi.received_quantity),
            'unit_price', poi.unit_price,
            'total_amount', poi.total_amount,
            'notes', poi.notes
          ) ORDER BY poi.id)
          FROM purchase_order_items poi
          JOIN products p ON p.id = poi.product_id
          WHERE poi.purchase_order_id = po.id
        ), '[]'::json) AS items
      FROM purchase_orders po
      LEFT JOIN suppliers s ON s.id = po.supplier_id
      LEFT JOIN warehouses w ON w.id = po.warehouse_id
      LEFT JOIN users u ON u.id = po.created_by
      WHERE po.id = $1
    `;
    const res = await query(sql, [id]);
    if (!res.rows[0]) {
      throw new AppError('أمر الشراء غير موجود', 404);
    }
    const r = res.rows[0];
    return {
      ...r,
      total_amount: roundMoney(Number(r.total_amount)),
    };
  },

  /**
   * إنشاء أمر شراء جديد (Draft)
   */
  async createPurchaseOrder(userId: number, data: CreatePurchaseOrderInput) {
    if (!data.items || !Array.isArray(data.items) || data.items.length === 0) {
      throw new AppError('يجب تحديد بند واحد على الأقل في أمر الشراء', 400);
    }

    const client = await getClient();
    try {
      await client.query('BEGIN');

      let warehouseId = data.warehouse_id;
      if (!warehouseId) {
        warehouseId = (await getDefaultWarehouseId(client)) ?? undefined;
      }

      // حساب المجموع والتحقق من المنتجات
      let totalAmount = 0;
      const validatedItems: Array<{
        product_id: number;
        quantity: number;
        unit_price: number;
        total_amount: number;
        notes?: string;
      }> = [];

      for (const item of data.items) {
        const pId = Number(item.product_id);
        const qty = Number(item.quantity);
        const price = Number(item.unit_price);

        if (!pId) throw new AppError('معرف المنتج مطلوب', 400);
        if (isNaN(qty) || qty <= 0) throw new AppError('الكمية يجب أن تكون أكبر من الصفر', 400);
        if (isNaN(price) || price < 0) throw new AppError('سعر الوحدة غير صحيح', 400);

        const lineTotal = roundMoney(qty * price);
        totalAmount = roundMoney(totalAmount + lineTotal);

        validatedItems.push({
          product_id: pId,
          quantity: qty,
          unit_price: price,
          total_amount: lineTotal,
          notes: item.notes?.trim() || undefined,
        });
      }

      const seqRes = await client.query(`SELECT nextval('seq_purchase_orders_number') AS n`);
      const yy = new Date().getFullYear();
      const poNumber = `PO-${yy}-${String(seqRes.rows[0].n).padStart(4, '0')}`;

      const poRes = await client.query(
        `INSERT INTO purchase_orders (
          po_number, supplier_id, warehouse_id, order_date, expected_date,
          status, total_amount, notes, created_by
        ) VALUES ($1, $2, $3, COALESCE($4::date, CURRENT_DATE), $5::date, 'draft', $6, $7, $8)
        RETURNING *`,
        [
          poNumber,
          data.supplier_id || null,
          warehouseId || null,
          data.order_date || null,
          data.expected_date || null,
          totalAmount,
          data.notes?.trim() || null,
          userId,
        ],
      );
      const po = poRes.rows[0];

      for (const item of validatedItems) {
        await client.query(
          `INSERT INTO purchase_order_items (
            purchase_order_id, product_id, quantity, received_quantity, unit_price, total_amount, notes
          ) VALUES ($1, $2, $3, 0, $4, $5, $6)`,
          [
            po.id,
            item.product_id,
            item.quantity,
            item.unit_price,
            item.total_amount,
            item.notes || null,
          ],
        );
      }

      await client.query('COMMIT');
      return this.getPurchaseOrderById(po.id);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  /**
   * اعتماد أمر الشراء (Approve)
   */
  async approvePurchaseOrder(id: number, _userId: number) {
    const po = await this.getPurchaseOrderById(id);
    if (po.status !== 'draft') {
      throw new AppError('لا يمكن اعتماد أمر شراء غير معلق أو تم اعتماده مسبقاً', 400);
    }

    const res = await query(
      `UPDATE purchase_orders 
       SET status = 'approved', updated_at = NOW() 
       WHERE id = $1 
       RETURNING *`,
      [id],
    );
    return this.getPurchaseOrderById(id);
  },

  /**
   * استلام بضاعة أمر الشراء (Goods Receipt)
   * مع إمكانية التحويل المباشر لفاتورة مشتريات وترحيلها دفترياً
   */
  async receiveGoods(id: number, userId: number, payload: ReceiveGoodsInput) {
    const po = await this.getPurchaseOrderById(id);
    if (po.status !== 'approved' && po.status !== 'partially_received') {
      throw new AppError(
        'أمر الشراء يجب أن يكون معتمداً أو مستلماً جزئياً لتسجيل استلام البضاعة',
        400,
      );
    }

    if (!payload.items || !Array.isArray(payload.items) || payload.items.length === 0) {
      throw new AppError('يجب تحديد كميات الاستلام للبند', 400);
    }

    const itemMap = new Map<number, any>();
    for (const it of po.items) {
      itemMap.set(Number(it.id), it);
    }

    const receiptLines: Array<{
      item_id: number;
      product_id: number;
      quantity_to_receive: number;
      unit_price: number;
      warehouse_id: number;
    }> = [];

    for (const r of payload.items) {
      const poi = itemMap.get(Number(r.item_id));
      if (!poi) {
        throw new AppError(`بند أمر الشراء رقم ${r.item_id} غير موجود في هذا الأمر`, 404);
      }
      const qty = Number(r.quantity_to_receive);
      if (isNaN(qty) || qty <= 0) continue;

      const remaining = Number(poi.remaining_quantity);
      if (qty > remaining + 0.001) {
        throw new AppError(
          `الكمية المستلمة (${qty}) تتجاوز الكمية المتبقية المطلوبة (${remaining}) للبند "${poi.product_name}"`,
          400,
        );
      }

      receiptLines.push({
        item_id: poi.id,
        product_id: poi.product_id,
        quantity_to_receive: qty,
        unit_price: poi.unit_price,
        warehouse_id: po.warehouse_id,
      });
    }

    if (receiptLines.length === 0) {
      throw new AppError('لم يتم تحديد أي كميات موجبة للاستلام', 400);
    }

    // إذا اختار المستخدم التحويل التلقائي لفاتورة مشتريات
    if (payload.convertToInvoice) {
      const invoiceItems = receiptLines.map((line) => ({
        product_id: line.product_id,
        quantity: line.quantity_to_receive,
        unit_price: line.unit_price,
      }));

      // إنشاء فاتورة المشتريات (تقوم بإضافة المخزون وحساب التكلفة وترحيل القيد للأستاذ)
      const invoice = await createPurchaseInvoice(
        {
          supplier_id: po.supplier_id,
          warehouse_id: po.warehouse_id,
          notes: `استلام آلي من أمر الشراء ${po.po_number}${payload.notes ? ' - ' + payload.notes : ''}`,
          items: invoiceItems,
        },
        userId,
      );

      // تحديث الكميات المستلمة وحالة أمر الشراء
      const client = await getClient();
      try {
        await client.query('BEGIN');
        for (const line of receiptLines) {
          await client.query(
            `UPDATE purchase_order_items
             SET received_quantity = received_quantity + $1
             WHERE id = $2`,
            [line.quantity_to_receive, line.item_id],
          );
        }

        // فحص هل تم استلام جميع بنود الأمر بالكامل
        const checkRes = await client.query(
          `SELECT 
             COUNT(*) AS total_items,
             COUNT(CASE WHEN received_quantity >= quantity THEN 1 END) AS completed_items
           FROM purchase_order_items
           WHERE purchase_order_id = $1`,
          [id],
        );
        const { total_items, completed_items } = checkRes.rows[0];
        const newStatus =
          Number(completed_items) >= Number(total_items) ? 'received' : 'partially_received';

        await client.query(
          `UPDATE purchase_orders SET status = $1, updated_at = NOW() WHERE id = $2`,
          [newStatus, id],
        );

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }

      return {
        purchase_order: await this.getPurchaseOrderById(id),
        purchase_invoice: invoice,
      };
    }

    // الاستلام المخزني فقط (بدون فاتورة مشتريات مالية فورية)
    const client = await getClient();
    try {
      await client.query('BEGIN');

      for (const line of receiptLines) {
        // تحديث بند أمر الشراء
        await client.query(
          `UPDATE purchase_order_items
           SET received_quantity = received_quantity + $1
           WHERE id = $2`,
          [line.quantity_to_receive, line.item_id],
        );

        // إضافة الرصيد إلى المخزن المحدد
        let whId = line.warehouse_id;
        if (!whId) {
          whId = (await getDefaultWarehouseId(client)) ?? 1;
        }

        await client.query(
          `INSERT INTO inventory (product_id, warehouse_id, quantity)
           VALUES ($1, $2, $3)
           ON CONFLICT (product_id, warehouse_id, COALESCE(batch_number, ''))
           DO UPDATE SET quantity = inventory.quantity + EXCLUDED.quantity, updated_at = NOW()`,
          [line.product_id, whId, line.quantity_to_receive],
        );

        // تسجيل حركة المخزون
        await client.query(
          `INSERT INTO stock_movements (
            product_id, to_warehouse_id, movement_type, quantity, reference_type, reference_id, user_id, notes, unit_cost, total_cost
          ) VALUES ($1, $2, 'purchase', $3, 'purchase_order', $4, $5, $6, $7, $8)`,
          [
            line.product_id,
            whId,
            line.quantity_to_receive,
            po.id,
            userId,
            `استلام بضاعة أمر شراء ${po.po_number}`,
            line.unit_price,
            roundMoney(line.quantity_to_receive * line.unit_price),
          ],
        );
      }

      // تحديث حالة أمر الشراء
      const checkRes = await client.query(
        `SELECT 
           COUNT(*) AS total_items,
           COUNT(CASE WHEN received_quantity >= quantity THEN 1 END) AS completed_items
         FROM purchase_order_items
         WHERE purchase_order_id = $1`,
        [id],
      );
      const { total_items, completed_items } = checkRes.rows[0];
      const newStatus =
        Number(completed_items) >= Number(total_items) ? 'received' : 'partially_received';

      await client.query(
        `UPDATE purchase_orders SET status = $1, updated_at = NOW() WHERE id = $2`,
        [newStatus, id],
      );

      await client.query('COMMIT');
      return {
        purchase_order: await this.getPurchaseOrderById(id),
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  /**
   * إلغاء أمر الشراء
   */
  async cancelPurchaseOrder(id: number, _userId: number) {
    const po = await this.getPurchaseOrderById(id);
    if (po.status === 'received' || po.status === 'partially_received') {
      throw new AppError('لا يمكن إلغاء أمر شراء تم استلام بضائع منه جزئياً أو كلياً', 400);
    }
    if (po.status === 'cancelled') {
      throw new AppError('أمر الشراء ملغي بالفعل', 400);
    }

    await query(
      `UPDATE purchase_orders SET status = 'cancelled', updated_at = NOW() WHERE id = $1`,
      [id],
    );
    return this.getPurchaseOrderById(id);
  },
};
