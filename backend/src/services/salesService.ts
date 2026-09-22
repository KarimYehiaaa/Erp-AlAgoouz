/**
 * salesService.ts — دورة المبيعات (التنسيق الرئيسي)
 * الملف المركزي لعمليات البيع: الإنشاء، التعديل، الإرجاع، الحذف، الاستيراد.
 * استُخرجت الأجزاء المساعدة إلى وحدات متخصصة لتقليل الحجم:
 *  - salesCalculations.ts : الحسابات النقيّة (المجاميع، المدفوع، المتبقي)
 *  - saleInventoryOps.ts  : عمليات المخزون (تحديد المخزن، التطبيق، الاسترجاع)
 */
import { salesRepository } from '../repositories/sales.repository.ts';
import { getClient, query } from '../database/pool.ts';
import { AppError } from '../types/errors.ts';
import { recalculateCustomerBalance } from './customerBalanceService.ts';
import { invalidateDashboardCache } from './dashboardService.ts';
import { broadcast } from './websocketService.ts';
import { roundMoney, parseAmount } from '../utils/money.ts';
import { businessToday } from '../utils/localDate.ts';
import {
  calculateOutstandingAmount,
  calculatePaidAmount,
  calculatePaymentTotal,
  calculateSaleTotals,
  SALE_TYPES,
} from './salesCalculations.ts';
import {
  applySaleItems,
  resolveSaleWarehouseId,
  restoreInventoryForSale,
} from './saleInventoryOps.ts';
import { getAllowedWarehouses } from '../middleware/warehouseAccess.ts';
import { ADMIN_ROLES } from '../../../shared/permissions.js';

const generateNumber = async (client, prefix, settingKey) => {
  const sequenceMap = {
    sale: 'seq_sales_number',
    invoice: 'seq_invoices_number',
  };
  const seqName = sequenceMap[settingKey] || 'seq_sales_number';
  const ALLOWED_SEQUENCES = new Set(['seq_sales_number', 'seq_invoices_number']);
  if (!ALLOWED_SEQUENCES.has(seqName)) {
    throw new Error('تسلسل غير مسموح به لمنع حقن SQL');
  }
  const res = await client.query(`SELECT nextval('${seqName}') AS next_val`);
  return `${prefix}-${res.rows[0].next_val}`;
};
/**
 * إنشاء بيع يومي مع التحقق من المخزون وتحديث الأرصدة.
 * @param {Record<string, any>} data بيانات البيع
 * @param {number} userId معرف المستخدم المنفّذ
 * @returns {Promise<any>}
 */
const createDailySale = async (data: Record<string, any>, userId: number) => {
  const saleType = data.sale_type;
  if (!['branch', 'wholesale', 'pos'].includes(saleType)) {
    throw new AppError(
      '\u0646\u0648\u0639 \u0627\u0644\u0628\u064A\u0639 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D. \u0627\u0644\u0623\u0646\u0648\u0627\u0639 \u0627\u0644\u0645\u062A\u0627\u062D\u0629: branch \u0623\u0648 wholesale \u0623\u0648 pos',
    );
  }
  const rawItems = Array.isArray(data.items) ? data.items : [];
  const totals = calculateSaleTotals(rawItems, data);
  const items = totals.items;
  const warehouseId = await resolveSaleWarehouseId(items, data.warehouse_id || null);
  let customerId = data.customer_id || null;
  if (data.customer_code && !customerId) {
    const c = await query(`SELECT id FROM customers WHERE code = $1 AND deleted_at IS NULL`, [
      data.customer_code,
    ]);
    customerId = c.rows[0]?.id || null;
  }
  if (saleType === 'wholesale' && !customerId) {
    throw new AppError(
      '\u064A\u062C\u0628 \u0627\u062E\u062A\u064A\u0627\u0631 \u0648\u062A\u062D\u062F\u064A\u062F \u0627\u0633\u0645 \u0627\u0644\u0639\u0645\u064A\u0644 \u0639\u0646\u062F \u0625\u0646\u0634\u0627\u0621 \u0645\u0628\u064A\u0639\u0627\u062A \u0627\u0644\u062C\u0645\u0644\u0629',
      400,
    );
  }
  let costAmount = 0;
  const subtotal = totals.subtotal;
  const totalAmount = totals.totalAmount;
  if (!totalAmount || totalAmount <= 0)
    throw new AppError(
      '\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0645\u0628\u064A\u0639\u0627\u062A \u064A\u062C\u0628 \u0623\u0646 \u064A\u0643\u0648\u0646 \u0623\u0643\u0628\u0631 \u0645\u0646 \u0635\u0641\u0631',
    );
  const paymentStatus = data.payment_status || 'paid';
  const effectivePaidAmount = calculatePaidAmount(
    paymentStatus,
    totalAmount,
    data.paid_amount || 0,
  );
  const saleDate = data.sale_date || data.date || businessToday();
  // Itemized sales always derive profit from server-side cost layers. Manual
  // profit is retained only for historical/daily sales without line items.
  let profitAmount = items.length ? 0 : parseAmount(data.profit_amount);
  const client = await getClient();
  try {
    await client.query('BEGIN');
    // حماية من الإرسال المزدوج (Offline replay): نفس sync_id يعيد البيع الموجود بدل إنشاء جديد
    const isUuid = (str: string) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
    const rawSyncId = typeof data.sync_id === 'string' && data.sync_id ? data.sync_id.trim() : null;
    const syncId = rawSyncId && isUuid(rawSyncId) ? rawSyncId : null;
    if (syncId) {
      const dup = await client.query(`SELECT id FROM sales WHERE sync_id = $1::uuid LIMIT 1`, [
        syncId,
      ]);
      if (dup.rows[0]) {
        const existingId = dup.rows[0].id;
        await client.query('COMMIT');
        return { ...(await getSaleById(existingId)), _duplicateSync: true };
      }
    }

    // التحقق الصارم من عزل الفروع: التأكد من أن المستخدم مصرح له بالمخزن المستنتج فعلياً
    const userRes = await client.query(
      `SELECT u.role_id, r.name as role_name FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = $1`,
      [userId],
    );
    const userRole = userRes.rows[0]?.role_name;
    if (userRole && !ADMIN_ROLES.includes(userRole)) {
      const allowedWarehouses = await getAllowedWarehouses(userId);
      if (!warehouseId || !allowedWarehouses.includes(Number(warehouseId))) {
        throw new AppError('غير مصرح لك بإنشاء مبيعات على هذا المخزن', 403);
      }
    }

    const saleNumber = await generateNumber(client, 'SL', 'sale');
    const entryMode = items.length ? 'pos' : 'daily';
    const saleResult = await client.query(
      `INSERT INTO sales (
        sale_number, sale_type, sale_date, entry_mode, customer_id, warehouse_id, user_id,
        subtotal, discount_amount, tax_amount, tax_percent, total_amount, cost_amount, profit_amount,
        payment_status, status, notes, sync_id,
        pos_shift_id, terminal_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'completed',$16,COALESCE($17::uuid, gen_random_uuid()),$18,$19) RETURNING *`,
      [
        saleNumber,
        saleType,
        saleDate,
        entryMode,
        customerId,
        warehouseId,
        userId,
        subtotal || 0,
        totals.discountAmount || 0,
        totals.taxAmount || 0,
        totals.taxPercent || 0,
        totalAmount,
        costAmount,
        profitAmount,
        paymentStatus,
        data.notes || null,
        syncId,
        data.pos_shift_id || null,
        data.terminal_id || null,
      ],
    );
    const sale = saleResult.rows[0];
    if (items.length) {
      costAmount = await applySaleItems(client, { saleId: sale.id, items, warehouseId, userId });
      profitAmount = roundMoney(totalAmount - costAmount);
      await client.query(`UPDATE sales SET cost_amount = $1, profit_amount = $2 WHERE id = $3`, [
        costAmount,
        profitAmount,
        sale.id,
      ]);
    }
    if (Array.isArray(data.payments) && data.payments.length > 0) {
      calculatePaymentTotal(data.payments, totalAmount);
      for (let idx = 0; idx < data.payments.length; idx++) {
        const p = data.payments[idx];
        const pAmount = roundMoney(Number(p.amount) || 0);
        if (pAmount > 0) {
          await client.query(
            `INSERT INTO payments (payment_number, reference_type, reference_id, amount, payment_method, user_id)
             VALUES ($1,'sale',$2,$3,$4,$5)`,
            [`PAY-${sale.id}-${idx + 1}`, sale.id, pAmount, p.payment_method || 'cash', userId],
          );
        }
      }
    } else if (effectivePaidAmount > 0) {
      await client.query(
        `INSERT INTO payments (payment_number, reference_type, reference_id, amount, payment_method, user_id)
         VALUES ($1,'sale',$2,$3,$4,$5)`,
        [`PAY-${sale.id}`, sale.id, effectivePaidAmount, data.payment_method || 'cash', userId],
      );
    }
    const invNumber = await generateNumber(client, 'INV', 'invoice');
    await client.query(
      `INSERT INTO invoices (
        invoice_number, sale_id, customer_id, subtotal, discount_amount, tax_amount,
        total_amount, payment_status, user_id, qr_data
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        invNumber,
        sale.id,
        customerId,
        subtotal || totalAmount,
        totals.discountAmount || 0,
        totals.taxAmount || 0,
        totalAmount,
        paymentStatus,
        userId,
        `SALE:${sale.id}`,
      ],
    );
    if (customerId) {
      await recalculateCustomerBalance((text, params) => client.query(text, params), customerId);

      // ─── محرك نقاط الولاء (Loyalty Points Engine) ───
      const redeemedPoints = Math.max(0, Math.floor(Number(data.loyalty_points_redeemed) || 0));
      // كل 10 جنيه مدفوعة تمنح العميل 1 نقطة ولاء
      const earnedPoints = Math.max(0, Math.floor(effectivePaidAmount / 10));

      if (redeemedPoints > 0 || earnedPoints > 0) {
        const custRes = await client.query(
          `SELECT loyalty_points FROM customers WHERE id = $1 FOR UPDATE`,
          [customerId],
        );
        const currentPoints = Number(custRes.rows[0]?.loyalty_points) || 0;
        const safeRedeemed = Math.min(redeemedPoints, currentPoints);
        const newPoints = Math.max(0, currentPoints - safeRedeemed + earnedPoints);

        await client.query(`UPDATE customers SET loyalty_points = $1 WHERE id = $2`, [
          newPoints,
          customerId,
        ]);
      }
    }
    const typeLabel = SALE_TYPES[saleType] || saleType;
    await client.query(
      `INSERT INTO activity_logs (user_id, module, action_ar, details) VALUES ($1,'sales',$2,$3)`,
      [
        userId,
        `إنشاء مبيعات ${typeLabel} - ${saleDate}`,
        JSON.stringify({ sale_id: sale.id, amount: totalAmount }),
      ],
    );

    // الترحيل المحاسبي التلقائي للقيد المزدوج
    const { accountingService } = await import('./accountingService.ts');
    await accountingService.postSaleJournalEntry(client, {
      id: sale.id,
      sale_number: sale.sale_number,
      sale_type: sale.sale_type,
      total_amount: totalAmount,
      cost_amount: costAmount,
      tax_amount: totals.taxAmount || 0,
      payment_method:
        data.payment_method ||
        (Array.isArray(data.payments) && data.payments[0]?.payment_method) ||
        'cash',
      customer_id: customerId,
      warehouse_id: warehouseId,
      user_id: userId,
      sale_date: sale.sale_date
        ? sale.sale_date.toISOString?.().slice(0, 10) || String(sale.sale_date).slice(0, 10)
        : saleDate,
    });

    await client.query('COMMIT');
    invalidateDashboardCache();
    broadcast('sales_changed', { action: 'create', sale_id: sale.id });
    return getSaleById(sale.id);
  } catch (err: any) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};
/**
 * تحديث بيع (عكس وتطبيق التغييرات على المخزون والأرصدة).
 * @param {number} saleId معرف البيع
 * @param {Record<string, any>} data البيانات الجديدة
 * @param {number} userId معرف المستخدم المنفّذ
 * @returns {Promise<any>}
 */
const updateSale = async (saleId: number, data: Record<string, any>, userId: number) => {
  const saleType = data.sale_type;
  if (!['branch', 'wholesale', 'pos'].includes(saleType)) {
    throw new AppError(
      '\u0646\u0648\u0639 \u0627\u0644\u0628\u064A\u0639 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D. \u0627\u0644\u0623\u0646\u0648\u0627\u0639 \u0627\u0644\u0645\u062A\u0627\u062D\u0629: branch \u0623\u0648 wholesale \u0623\u0648 pos',
    );
  }
  let customerId = data.customer_id || null;
  if (data.customer_code && !customerId) {
    const c = await query(`SELECT id FROM customers WHERE code = $1 AND deleted_at IS NULL`, [
      data.customer_code,
    ]);
    customerId = c.rows[0]?.id || null;
  }
  if (saleType === 'wholesale' && !customerId) {
    throw new AppError(
      '\u064A\u062C\u0628 \u0627\u062E\u062A\u064A\u0627\u0631 \u0648\u062A\u062D\u062F\u064A\u062F \u0627\u0633\u0645 \u0627\u0644\u0639\u0645\u064A\u0644 \u0639\u0646\u062F \u062A\u0639\u062F\u064A\u0644 \u0645\u0628\u064A\u0639\u0627\u062A \u0627\u0644\u062C\u0645\u0644\u0629',
      400,
    );
  }
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const existingSale = (
      await client.query(`SELECT * FROM sales WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, [
        saleId,
      ])
    ).rows[0];
    if (!existingSale)
      throw new AppError(
        '\u0639\u0645\u0644\u064A\u0629 \u0627\u0644\u0628\u064A\u0639 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629',
        404,
      );
    if (existingSale.status !== 'completed')
      throw new AppError(
        '\u0644\u0627 \u064A\u0645\u0643\u0646 \u062A\u0639\u062F\u064A\u0644 \u0639\u0645\u0644\u064A\u0629 \u063A\u064A\u0631 \u0645\u0643\u062A\u0645\u0644\u0629',
      );
    const oldCustomerId = existingSale.customer_id;
    const oldItems = (await client.query(`SELECT * FROM sale_items WHERE sale_id = $1`, [saleId]))
      .rows;
    const shouldReplaceItems = Array.isArray(data.items);
    const totals = calculateSaleTotals(shouldReplaceItems ? data.items : [], data);
    const items = totals.items;
    const entryMode = shouldReplaceItems
      ? items.length
        ? 'pos'
        : 'daily'
      : existingSale.entry_mode;
    const saleDate = data.sale_date || existingSale.sale_date;
    const totalAmount =
      shouldReplaceItems && items.length
        ? totals.totalAmount
        : roundMoney(parseAmount(data.total_amount, existingSale.total_amount));
    if (!totalAmount || totalAmount <= 0)
      throw new AppError(
        '\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0645\u0628\u064A\u0639\u0627\u062A \u064A\u062C\u0628 \u0623\u0646 \u064A\u0643\u0648\u0646 \u0623\u0643\u0628\u0631 \u0645\u0646 \u0635\u0641\u0631',
      );
    // المدفوع المطلوب: يُحتسب فقط إذا أُرسلت بيانات دفع صريحة،
    // وإلا يُحافظ على سجل الدفعات الحقيقي كما هو (تسوية بالفرق لاحقاً)
    const providesPaymentInput =
      data.payment_status !== undefined || data.paid_amount !== undefined;
    const requestedPaidAmount = providesPaymentInput
      ? calculatePaidAmount(
          data.payment_status || existingSale.payment_status || 'paid',
          totalAmount,
          data.paid_amount || 0,
        )
      : null;
    const warehouseId =
      shouldReplaceItems && items.length
        ? await resolveSaleWarehouseId(items, data.warehouse_id || existingSale.warehouse_id)
        : data.warehouse_id
          ? Number(data.warehouse_id)
          : existingSale.warehouse_id;
    let subtotal = shouldReplaceItems && items.length ? totals.subtotal : totalAmount;
    let costAmount = shouldReplaceItems
      ? 0
      : roundMoney(parseAmount(data.cost_amount, existingSale.cost_amount));
    let profitAmount = parseAmount(data.profit_amount, existingSale.profit_amount);
    if (shouldReplaceItems) {
      if (oldItems.length > 0) {
        await restoreInventoryForSale(client, saleId, userId);
      }
      await client.query(`DELETE FROM sale_items WHERE sale_id = $1`, [saleId]);
      if (items.length) {
        costAmount = await applySaleItems(client, { saleId, items, warehouseId, userId });
        profitAmount = roundMoney(totalAmount - costAmount);
      } else {
        subtotal = totalAmount;
        costAmount = 0;
        profitAmount = parseAmount(data.profit_amount, 0);
      }
    }
    // تسوية الدفعات بالفرق فقط — لا يُحذف السجل المالي كاملاً عند كل تعديل
    const existingPaidRes = await client.query(
      `SELECT COALESCE(SUM(amount), 0)::numeric AS total FROM payments WHERE reference_type = 'sale' AND reference_id = $1`,
      [saleId],
    );
    const existingPaid = Number(existingPaidRes.rows[0].total || 0);
    const targetPaid = requestedPaidAmount === null ? existingPaid : requestedPaidAmount;

    if (targetPaid > existingPaid + 1e-9) {
      await client.query(
        `INSERT INTO payments (payment_number, reference_type, reference_id, amount, payment_method, user_id)
         VALUES ($1,'sale',$2,$3,$4,$5)`,
        [
          `PAY-${saleId}-${Date.now()}`,
          saleId,
          roundMoney(targetPaid - existingPaid),
          data.payment_method || 'cash',
          userId,
        ],
      );
    } else if (targetPaid < existingPaid - 1e-9) {
      // تقليص المدفوع من أحدث دفعة لأقدمها، مع تعديل جزئي لآخر دفعة عند الحاجة
      let excess = roundMoney(existingPaid - targetPaid);
      const payRows = (
        await client.query(
          `SELECT id, amount FROM payments WHERE reference_type = 'sale' AND reference_id = $1 ORDER BY id DESC FOR UPDATE`,
          [saleId],
        )
      ).rows;
      for (const pay of payRows) {
        if (excess <= 1e-9) break;
        const amt = Number(pay.amount);
        if (amt <= excess + 1e-9) {
          await client.query(`DELETE FROM payments WHERE id = $1`, [pay.id]);
          excess = roundMoney(excess - amt);
        } else {
          await client.query(`UPDATE payments SET amount = $1 WHERE id = $2`, [
            roundMoney(amt - excess),
            pay.id,
          ]);
          excess = 0;
        }
      }
    }
    // تصحيح حالة الدفع لتطابق الواقع الفعلي بعد التسوية
    const finalPaymentStatus =
      targetPaid >= totalAmount - 0.01 ? 'paid' : targetPaid > 0.01 ? 'partial' : 'unpaid';
    await client.query(
      `UPDATE sales SET
        sale_type = $1,
        sale_date = $2,
        entry_mode = $3,
        customer_id = $4,
        warehouse_id = $5,
        subtotal = $6,
        discount_amount = $7,
        tax_amount = $8,
        tax_percent = $9,
        total_amount = $10,
        cost_amount = $11,
        profit_amount = $12,
        payment_status = $13,
        notes = $14,
        updated_at = NOW()
       WHERE id = $15`,
      [
        saleType,
        saleDate,
        entryMode,
        customerId,
        warehouseId || null,
        subtotal || 0,
        totals.discountAmount || 0,
        totals.taxAmount || 0,
        totals.taxPercent || 0,
        totalAmount,
        costAmount,
        profitAmount,
        finalPaymentStatus,
        data.notes || null,
        saleId,
      ],
    );
    await client.query(
      `UPDATE invoices SET
        customer_id = $1,
        subtotal = $2,
        discount_amount = $3,
        tax_amount = $4,
        total_amount = $5,
        payment_status = $6
       WHERE sale_id = $7 AND deleted_at IS NULL`,
      [
        customerId,
        subtotal || totalAmount,
        totals.discountAmount || 0,
        totals.taxAmount || 0,
        totalAmount,
        finalPaymentStatus,
        saleId,
      ],
    );
    if (oldCustomerId) {
      await recalculateCustomerBalance((text, params) => client.query(text, params), oldCustomerId);
    }
    if (customerId && customerId !== oldCustomerId) {
      await recalculateCustomerBalance((text, params) => client.query(text, params), customerId);
    }
    await client.query(
      `INSERT INTO activity_logs (user_id, module, action_ar, details) VALUES ($1,'sales',$2,$3)`,
      [
        userId,
        `\u062A\u0639\u062F\u064A\u0644 \u0641\u0627\u062A\u0648\u0631\u0629 \u0628\u064A\u0639 ${existingSale.sale_number}`,
        JSON.stringify({ sale_id: saleId, amount: totalAmount }),
      ],
    );

    // الترحيل المحاسبي التلقائي للقيد المزدوج بعد التعديل
    const { accountingService } = await import('./accountingService.ts');
    await accountingService.deleteJournalEntryByReference(client, 'sale', saleId);
    await accountingService.postSaleJournalEntry(client, {
      id: saleId,
      sale_number: existingSale.sale_number,
      sale_type: saleType,
      total_amount: totalAmount,
      cost_amount: costAmount,
      tax_amount: totals.taxAmount || 0,
      payment_method: data.payment_method || existingSale.payment_method || 'cash',
      customer_id: customerId,
      warehouse_id: warehouseId,
      user_id: userId,
      sale_date: saleDate
        ? saleDate.toISOString?.().slice(0, 10) || String(saleDate).slice(0, 10)
        : undefined,
    });

    await client.query('COMMIT');
    invalidateDashboardCache();
    broadcast('sales_changed', { action: 'update', sale_id: saleId });
    return getSaleById(saleId);
  } catch (err: any) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};
/**
 * جلب المبيعات مع فلترة وترقيم صفحات.
 * @param {Record<string, any>} [filters] خيارات الفلترة (sale_type, from_date, to_date, limit...)
 * @returns {Promise<{ rows: any[], total: number }>}
 */
const getSales = async (filters: Record<string, any> = {}) => {
  return await salesRepository.getSalesList(filters);
};
/**
 * ملخص المبيعات حسب النوع والتاريخ.
 * @param {Record<string, any>} [filters] خيارات الفلترة (sale_type, from_date, to_date)
 * @returns {Promise<any[]>}
 */
const getSalesSummary = async (filters: Record<string, any> = {}) => {
  let sql = `SELECT sale_type, sale_date,
    COUNT(*) FILTER (WHERE status = 'completed') as count,
    COALESCE(SUM(total_amount) FILTER (WHERE status = 'completed'), 0) as total,
    COALESCE(SUM(profit_amount) FILTER (WHERE status = 'completed'), 0) as profit
    FROM sales WHERE deleted_at IS NULL`;
  const params: any[] = [];
  let idx = 1;
  if (filters.sale_type) {
    sql += ` AND sale_type = $${idx++}`;
    params.push(filters.sale_type);
  }
  if (filters.from_date) {
    sql += ` AND sale_date >= $${idx++}`;
    params.push(filters.from_date);
  }
  if (filters.to_date) {
    sql += ` AND sale_date <= $${idx}`;
    params.push(filters.to_date);
  }
  sql += ` GROUP BY sale_type, sale_date ORDER BY sale_date DESC`;
  return (await query(sql, params)).rows;
};
/** جلب بيع واحد كاملاً مع الأصناف. */
const getSaleById = async (id: number) => {
  const result = await query(
    `SELECT s.*, c.name_ar as customer_name, c.code as customer_code, u.full_name as user_name,
      (SELECT json_agg(json_build_object(
        'id', si.id, 'product_id', si.product_id, 'product_name', p.name_ar,
        'quantity', si.quantity, 'unit_price', si.unit_price,
        'discount_amount', si.discount_amount, 'tax_amount', si.tax_amount,
        'total_amount', si.total_amount
      )) FROM sale_items si JOIN products p ON si.product_id = p.id WHERE si.sale_id = s.id) as items,
      (SELECT json_agg(json_build_object('method', payment_method, 'amount', amount))
       FROM payments WHERE reference_type='sale' AND reference_id = s.id) as payments
     FROM sales s
     LEFT JOIN customers c ON s.customer_id = c.id
     LEFT JOIN users u ON s.user_id = u.id
     WHERE s.id = $1 AND s.deleted_at IS NULL`,
    [id],
  );
  if (!result.rows[0])
    throw new AppError(
      '\u0639\u0645\u0644\u064A\u0629 \u0627\u0644\u0628\u064A\u0639 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629',
      404,
    );
  return result.rows[0];
};
/**
 * إرجاع بيع كامل مع إعادة الكميات للمخزون.
 * @param {number} saleId معرف البيع
 * @param {number} userId معرف المستخدم المنفّذ
 * @param {string} [notes] ملاحظات الإرجاع
 * @returns {Promise<any>}
 */
const returnSale = async (saleId: number, userId: number, notes?: string) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const sale = (await client.query(`SELECT * FROM sales WHERE id = $1 FOR UPDATE`, [saleId]))
      .rows[0];
    if (!sale)
      throw new AppError(
        '\u0639\u0645\u0644\u064A\u0629 \u0627\u0644\u0628\u064A\u0639 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629',
        404,
      );
    if (sale.status === 'returned')
      throw new AppError(
        '\u0647\u0630\u0647 \u0627\u0644\u0639\u0645\u0644\u064A\u0629 \u062A\u0645 \u0625\u0631\u062C\u0627\u0639\u0647\u0627 \u0645\u0633\u0628\u0642\u0627\u064B',
      );

    // التحقق من عزل الفروع: التأكد من أن مخزن الفاتورة مصرح به للمستخدم
    const userRes = await client.query(
      `SELECT u.role_id, r.name as role_name FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = $1`,
      [userId],
    );
    const userRole = userRes.rows[0]?.role_name;
    if (userRole && !ADMIN_ROLES.includes(userRole)) {
      const allowedWarehouses = await getAllowedWarehouses(userId);
      if (sale.warehouse_id && !allowedWarehouses.includes(Number(sale.warehouse_id))) {
        throw new AppError('غير مصرح لك بإجراء مرتجع لفاتورة تابعة لمخزن آخر', 403);
      }
    }
    const items = (await client.query(`SELECT * FROM sale_items WHERE sale_id = $1`, [saleId]))
      .rows;
    if (items.length > 0) {
      await restoreInventoryForSale(client, saleId, userId);
    }
    await client.query(
      `UPDATE sales SET status = 'returned', payment_status = 'refunded', notes = COALESCE(notes,'') || $2 WHERE id = $1`,
      [saleId, notes ? `\n[مرتجع] ${notes}` : '\n[مرتجع]'],
    );
    await client.query(`UPDATE invoices SET payment_status = 'refunded' WHERE sale_id = $1`, [
      saleId,
    ]);
    if (sale.customer_id) {
      await recalculateCustomerBalance(
        (text, params) => client.query(text, params),
        sale.customer_id,
      );
    }
    await client.query(
      `INSERT INTO activity_logs (user_id, module, action_ar, details) VALUES ($1,'sales',$2,$3)`,
      [userId, `مرتجع بيع ${sale.sale_number}`, JSON.stringify({ sale_id: saleId })],
    );

    // إذا كانت الفاتورة المرتجعة نقدية، وكان للمستخدم وردية POS مفتوحة، نسجل حركة سحب نقدي بالوردية الحالية
    const isCashRefund = (sale.payment_method || 'cash').toLowerCase() === 'cash';
    if (isCashRefund) {
      const activeShiftRes = await client.query(
        `SELECT id FROM pos_shifts WHERE cashier_user_id = $1 AND warehouse_id = $2 AND status = 'open' LIMIT 1`,
        [userId, sale.warehouse_id],
      );
      if (activeShiftRes.rows.length > 0) {
        await client.query(
          `INSERT INTO pos_cash_movements (shift_id, movement_type, amount, reason, authorized_by)
           VALUES ($1, 'expense', $2, $3, $4)`,
          [
            activeShiftRes.rows[0].id,
            Number(sale.total_amount),
            `رد نقدية لمرتجع بيع ${sale.sale_number}`,
            userId,
          ],
        );
      }
    }

    const { accountingService } = await import('./accountingService.ts');
    await accountingService.postSalesRefundJournalEntry(client, {
      id: sale.id,
      sale_number: sale.sale_number,
      total_amount: Number(sale.total_amount),
      tax_amount: Number(sale.tax_amount || 0),
      cost_amount: Number(sale.cost_amount || 0),
      sale_type: sale.sale_type,
      payment_method: sale.payment_method,
      customer_id: sale.customer_id,
      warehouse_id: sale.warehouse_id,
      user_id: userId,
    });

    await client.query('COMMIT');
    invalidateDashboardCache();
    broadcast('sales_changed', { action: 'return', sale_id: saleId });
    return getSaleById(saleId);
  } catch (err: any) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};
/** مسح كل المبيعات (إعادة ضبط) — للمدير فقط. */
const deleteAllSales = async (userId: number) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const countResult = await client.query(
      `SELECT COUNT(*)::int as count FROM sales WHERE deleted_at IS NULL`,
    );
    const deletedCount = countResult.rows[0]?.count || 0;
    if (deletedCount > 0) {
      const customersRes = await client.query(
        `SELECT DISTINCT customer_id FROM sales WHERE deleted_at IS NULL AND customer_id IS NOT NULL`,
      );
      const posSales = await client.query(
        `SELECT id FROM sales WHERE deleted_at IS NULL AND status <> 'returned'`,
      );
      for (const row of posSales.rows) {
        await restoreInventoryForSale(client, row.id, userId);
        const { accountingService } = await import('./accountingService.ts');
        await accountingService.deleteJournalEntryByReference(client, 'sale', row.id);
      }
      await client.query(
        `UPDATE sales
         SET deleted_at = NOW(), status = 'cancelled', updated_at = NOW()
         WHERE deleted_at IS NULL`,
      );
      await client.query(
        `UPDATE invoices
         SET deleted_at = NOW()
         WHERE sale_id IN (SELECT id FROM sales WHERE deleted_at IS NOT NULL) AND deleted_at IS NULL`,
      );
      for (const row of customersRes.rows) {
        await recalculateCustomerBalance(
          (text, params) => client.query(text, params),
          row.customer_id,
        );
      }
    }
    await client.query(
      `INSERT INTO activity_logs (user_id, module, action_ar, details)
       VALUES ($1,'sales',$2,$3)`,
      [
        userId,
        '\u062D\u0630\u0641 \u0627\u0644\u0645\u0628\u064A\u0639\u0627\u062A \u0627\u0644\u062D\u0627\u0644\u064A\u0629',
        JSON.stringify({ deleted_count: deletedCount }),
      ],
    );
    await client.query('COMMIT');
    invalidateDashboardCache();
    broadcast('sales_changed', { action: 'delete_all' });
    return { deletedCount };
  } catch (err: any) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};
/** حذف مبيعات يوم محدد. */
const deleteSalesByDate = async (saleDate: string, userId: number) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(saleDate || ''))) {
    throw new AppError(
      '\u062A\u0627\u0631\u064A\u062E \u0627\u0644\u0628\u064A\u0639 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D. \u0627\u0644\u0635\u064A\u063A\u0629 \u0627\u0644\u0645\u0637\u0644\u0648\u0628\u0629 YYYY-MM-DD',
      400,
    );
  }
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const countResult = await client.query(
      `SELECT COUNT(*)::int as count
       FROM sales
       WHERE deleted_at IS NULL AND sale_date = $1::date`,
      [saleDate],
    );
    const deletedCount = countResult.rows[0]?.count || 0;
    if (deletedCount > 0) {
      const customersRes = await client.query(
        `SELECT DISTINCT customer_id FROM sales WHERE deleted_at IS NULL AND sale_date = $1::date AND customer_id IS NOT NULL`,
        [saleDate],
      );
      const posSales = await client.query(
        `SELECT id FROM sales WHERE deleted_at IS NULL AND sale_date = $1::date AND status <> 'returned'`,
        [saleDate],
      );
      for (const row of posSales.rows) {
        await restoreInventoryForSale(client, row.id, userId);
        const { accountingService } = await import('./accountingService.ts');
        await accountingService.deleteJournalEntryByReference(client, 'sale', row.id);
      }
      await client.query(
        `UPDATE sales
         SET deleted_at = NOW(), status = 'cancelled', updated_at = NOW()
         WHERE deleted_at IS NULL AND sale_date = $1::date`,
        [saleDate],
      );
      await client.query(
        `UPDATE invoices i
         SET deleted_at = NOW()
         WHERE i.deleted_at IS NULL
           AND EXISTS (
             SELECT 1 FROM sales s
             WHERE s.id = i.sale_id
               AND s.sale_date = $1::date
               AND s.deleted_at IS NOT NULL
           )`,
        [saleDate],
      );
      for (const row of customersRes.rows) {
        await recalculateCustomerBalance(
          (text, params) => client.query(text, params),
          row.customer_id,
        );
      }
    }
    await client.query(
      `INSERT INTO activity_logs (user_id, module, action_ar, details)
       VALUES ($1,'sales',$2,$3)`,
      [
        userId,
        `حذف مبيعات بتاريخ ${saleDate}`,
        JSON.stringify({ sale_date: saleDate, deleted_count: deletedCount }),
      ],
    );
    await client.query('COMMIT');
    invalidateDashboardCache();
    broadcast('sales_changed', { action: 'delete_date', date: saleDate });
    return { deletedCount, saleDate };
  } catch (err: any) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};
/** حذف المبيعات حسب النوع (branch/wholesale/pos). */
const deleteSalesByType = async (saleType: string, userId: number) => {
  if (!['branch', 'wholesale'].includes(saleType)) {
    throw new AppError('نوع البيع غير صالح', 400);
  }
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const countResult = await client.query(
      `SELECT COUNT(*)::int as count FROM sales WHERE deleted_at IS NULL AND sale_type = $1`,
      [saleType],
    );
    const deletedCount = countResult.rows[0]?.count || 0;
    if (deletedCount > 0) {
      const customersRes = await client.query(
        `SELECT DISTINCT customer_id FROM sales WHERE deleted_at IS NULL AND sale_type = $1 AND customer_id IS NOT NULL`,
        [saleType],
      );
      const posSales = await client.query(
        `SELECT id FROM sales WHERE deleted_at IS NULL AND sale_type = $1 AND status <> 'returned'`,
        [saleType],
      );
      for (const row of posSales.rows) {
        await restoreInventoryForSale(client, row.id, userId);
        const { accountingService } = await import('./accountingService.ts');
        await accountingService.deleteJournalEntryByReference(client, 'sale', row.id);
      }
      await client.query(
        `UPDATE sales SET deleted_at = NOW(), status = 'cancelled', updated_at = NOW()
         WHERE deleted_at IS NULL AND sale_type = $1`,
        [saleType],
      );
      await client.query(
        `UPDATE invoices SET deleted_at = NOW()
         WHERE deleted_at IS NULL AND sale_id IN (
           SELECT id FROM sales WHERE sale_type = $1 AND deleted_at IS NOT NULL
         )`,
        [saleType],
      );
      for (const row of customersRes.rows) {
        await recalculateCustomerBalance(
          (text, params) => client.query(text, params),
          row.customer_id,
        );
      }
    }
    const typeLabel = saleType === 'branch' ? '\u0641\u0631\u0639' : '\u062C\u0645\u0644\u0629';
    await client.query(
      `INSERT INTO activity_logs (user_id, module, action_ar, details) VALUES ($1,'sales',$2,$3)`,
      [
        userId,
        `\u062D\u0630\u0641 \u0643\u0644 \u0645\u0628\u064A\u0639\u0627\u062A ${typeLabel}`,
        JSON.stringify({ sale_type: saleType, deleted_count: deletedCount }),
      ],
    );
    await client.query('COMMIT');
    invalidateDashboardCache();
    broadcast('sales_changed', { action: 'delete_type', type: saleType });
    return { deletedCount, saleType };
  } catch (err: any) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};
/**
 * استيراد مبيعات يومية (من Excel) دفعة واحدة.
 * @param {any[]} rows صفوف المبيعات المستوردة
 * @param {number} userId معرف المستخدم المنفّذ
 * @returns {Promise<{ created: number }>}
 */
const importDailySales = async (rows: any[], userId: number) => {
  const MAX_IMPORT = 500;
  if (rows.length > MAX_IMPORT) {
    throw new AppError(
      `\u0627\u0644\u062D\u062F \u0627\u0644\u0623\u0642\u0635\u0649 \u0644\u0644\u0627\u0633\u062A\u064A\u0631\u0627\u062F \u0647\u0648 ${MAX_IMPORT} \u0633\u0637\u0631 \u062F\u0641\u0639\u0629 \u0648\u0627\u062D\u062F\u0629`,
      400,
    );
  }
  const results = { success: 0, failed: [] as any[], total: rows.length };
  for (let i = 0; i < rows.length; i++) {
    try {
      await createDailySale(rows[i], userId);
      results.success++;
    } catch (err: any) {
      results.failed.push({ row: i + 2, message: err.message, data: rows[i] });
    }
  }
  return results;
};
export {
  calculateOutstandingAmount,
  calculatePaidAmount,
  calculateSaleTotals,
  createDailySale,
  deleteAllSales,
  deleteSalesByDate,
  deleteSalesByType,
  getSaleById,
  getSales,
  getSalesSummary,
  importDailySales,
  returnSale,
  updateSale,
};
