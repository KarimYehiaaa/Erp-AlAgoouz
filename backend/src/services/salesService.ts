import { standalonePaymentSourceSql, linkPaymentJournalSources } from './paymentJournalSources.ts';
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
import { broadcast } from './websocketService.ts';
import { emitAutomationEvent } from './automationEventBus.ts';
import { roundMoney, parseAmount } from '../utils/money.ts';
import { businessToday } from '../utils/localDate.ts';
import { resolveSaleSettlement } from '../../../shared/saleSettlement.ts';
import { settleSalePaymentAllocations } from './salePaymentOps.ts';
import {
  calculateOutstandingAmount,
  calculatePaidAmount,
  calculateSaleTotals,
  SALE_TYPES,
} from './salesCalculations.ts';
import {
  applySaleItems,
  resolveSaleWarehouseId,
  restoreInventoryForSale,
} from './saleInventoryOps.ts';
import { getAllowedWarehouses } from '../middleware/warehouseAccess.ts';
import { parseSaleSyncId } from '../utils/saleSyncId.ts';
import { WAREHOUSE_GLOBAL_ROLES } from '../../../shared/permissions.js';

const assertSaleWarehouseAccess = async (client, userId: number, warehouseId: number | null) => {
  const userRes = await client.query(
    `SELECT r.name AS role_name FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = $1`,
    [userId],
  );
  const role = userRes.rows[0]?.role_name;
  if (role && WAREHOUSE_GLOBAL_ROLES.includes(role)) return;

  const allowedWarehouses = await getAllowedWarehouses(userId, client);
  if (!warehouseId || !allowedWarehouses.includes(Number(warehouseId))) {
    throw new AppError('غير مصرح لك بالوصول لهذا المخزن', 403);
  }
};

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
  if (!['retail', 'wholesale', 'pos'].includes(saleType)) {
    throw new AppError(
      '\u0646\u0648\u0639 \u0627\u0644\u0628\u064A\u0639 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D. \u0627\u0644\u0623\u0646\u0648\u0627\u0639 \u0627\u0644\u0645\u062A\u0627\u062D\u0629: retail \u0623\u0648 wholesale \u0623\u0648 pos',
    );
  }
  const syncId = parseSaleSyncId(data.sync_id);
  const rawItems = Array.isArray(data.items) ? data.items : [];
  const totals = calculateSaleTotals(rawItems, data);
  const items = totals.items;
  const rawRedeemedPoints = Number(data.loyalty_points_redeemed || 0);
  if (!Number.isSafeInteger(rawRedeemedPoints) || rawRedeemedPoints < 0) {
    throw new AppError('عدد نقاط الولاء المستبدلة غير صالح', 400);
  }
  const redeemedPoints = rawRedeemedPoints;
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
  if (redeemedPoints > 0) {
    if (!customerId || !items.length) {
      throw new AppError('استبدال نقاط الولاء يتطلب عميلاً وفاتورة أصناف', 400);
    }
    if (roundMoney(redeemedPoints / 10) > totals.discountAmount) {
      throw new AppError('خصم الفاتورة أقل من قيمة نقاط الولاء المستبدلة', 400);
    }
  }
  let costAmount = 0;
  const subtotal = totals.subtotal;
  const totalAmount = totals.totalAmount;
  if (!totalAmount || totalAmount <= 0)
    throw new AppError(
      '\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0645\u0628\u064A\u0639\u0627\u062A \u064A\u062C\u0628 \u0623\u0646 \u064A\u0643\u0648\u0646 \u0623\u0643\u0628\u0631 \u0645\u0646 \u0635\u0641\u0631',
    );
  const saleDate = data.sale_date || data.date || businessToday();
  // Itemized sales always derive profit from server-side cost layers. Manual
  // profit is retained only for historical/daily sales without line items.
  let profitAmount = items.length ? 0 : parseAmount(data.profit_amount);
  const client = await getClient();
  try {
    await client.query('BEGIN');
    // حماية من الإرسال المزدوج (Offline replay): نفس sync_id يعيد البيع الموجود بدل إنشاء جديد
    if (syncId) {
      const dup = await client.query(
        `SELECT id, warehouse_id FROM sales WHERE sync_id = $1::uuid LIMIT 1`,
        [syncId],
      );
      if (dup.rows[0]) {
        const existingId = dup.rows[0].id;
        await assertSaleWarehouseAccess(client, userId, dup.rows[0].warehouse_id);
        await client.query('COMMIT');
        return { ...(await getSaleById(existingId)), _duplicateSync: true };
      }
    }

    await assertSaleWarehouseAccess(client, userId, warehouseId);

    let settlement: ReturnType<typeof resolveSaleSettlement>;
    try {
      settlement = resolveSaleSettlement({ ...data, total_amount: totalAmount });
    } catch (error) {
      throw new AppError(error instanceof Error ? error.message : 'بيانات الدفع غير صالحة', 400);
    }
    const paymentStatus = settlement.payment_status;
    const effectivePaidAmount = settlement.paid_amount;

    if (data.pos_shift_id != null) {
      const shiftId = Number(data.pos_shift_id);
      if (!Number.isSafeInteger(shiftId) || shiftId <= 0) {
        throw new AppError('رقم الوردية غير صالح', 400);
      }
      // Serialize against closeShift so a sale cannot be added after its totals
      // have been calculated. Idempotent replays were handled above this lock.
      const shiftResult = await client.query(
        `SELECT status, cashier_user_id, warehouse_id, terminal_id
         FROM pos_shifts WHERE id = $1 FOR UPDATE`,
        [shiftId],
      );
      const shift = shiftResult.rows[0];
      if (!shift || shift.status !== 'open') {
        throw new AppError('لا يمكن إضافة مبيعات إلى وردية مغلقة أو غير موجودة', 409);
      }
      if (
        Number(shift.cashier_user_id) !== Number(userId) ||
        Number(shift.warehouse_id) !== Number(warehouseId)
      ) {
        throw new AppError('الوردية لا تخص الكاشير أو مخزن الفاتورة', 403);
      }
      if (data.terminal_id != null && Number(data.terminal_id) !== Number(shift.terminal_id)) {
        throw new AppError('جهاز الكاشير لا يطابق جهاز الوردية', 400);
      }
    }

    if (redeemedPoints > 0) {
      const loyaltyResult = await client.query(
        `SELECT loyalty_points FROM customers WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
        [customerId],
      );
      if (!loyaltyResult.rows[0] || Number(loyaltyResult.rows[0].loyalty_points) < redeemedPoints) {
        throw new AppError('رصيد نقاط الولاء غير كافٍ', 400);
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
    const initialReceiptNumbers: string[] = [];
    if (settlement.payments.length > 0) {
      for (let idx = 0; idx < settlement.payments.length; idx++) {
        const p = settlement.payments[idx];
        const pAmount = roundMoney(Number(p.amount) || 0);
        if (pAmount > 0) {
          initialReceiptNumbers.push(`PAY-${sale.id}-${idx + 1}`);
          await client.query(
            `INSERT INTO payments (payment_number, reference_type, reference_id, amount, payment_method, user_id)
             VALUES ($1,'sale',$2,$3,$4,$5)`,
            [`PAY-${sale.id}-${idx + 1}`, sale.id, pAmount, p.payment_method || 'cash', userId],
          );
        }
      }
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
      // كل 10 جنيه مدفوعة تمنح العميل 1 نقطة ولاء
      const earnedPoints = Math.max(0, Math.floor(effectivePaidAmount / 10));

      if (redeemedPoints > 0 || earnedPoints > 0) {
        const custRes = await client.query(
          `SELECT loyalty_points FROM customers WHERE id = $1 FOR UPDATE`,
          [customerId],
        );
        const currentPoints = Number(custRes.rows[0]?.loyalty_points) || 0;
        const newPoints = currentPoints - redeemedPoints + earnedPoints;

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
    const journal = await accountingService.postSaleJournalEntry(client, {
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
      payment_status: paymentStatus,
      paid_amount: effectivePaidAmount,
      payments: settlement.payments,
      customer_id: customerId,
      warehouse_id: warehouseId,
      user_id: userId,
      sale_date: sale.sale_date
        ? sale.sale_date.toISOString?.().slice(0, 10) || String(sale.sale_date).slice(0, 10)
        : saleDate,
    });

    if (!journal) throw new AppError('تعذر ترحيل البيع', 409);
    await linkPaymentJournalSources(client, initialReceiptNumbers, journal.id);
    await client.query('COMMIT');
    broadcast('sales_changed', { action: 'create', sale_id: sale.id });
    // حدث أتمتة فوري غير حاجب: فحص الخصم الكبير (حد النسبة من config المهمة أو 15)
    emitAutomationEvent('large_discount_alert', {
      sale_id: sale.id,
      sale_number: sale.sale_number,
      subtotal: Number(subtotal || 0),
      discount_amount: Number(totals.discountAmount || 0),
      cashier_user_id: userId,
    });
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
  if (Number(data.loyalty_points_redeemed || 0) !== 0) {
    throw new AppError('لا يمكن استبدال نقاط الولاء عند تعديل فاتورة محفوظة', 400);
  }
  const saleType = data.sale_type;
  if (!['retail', 'wholesale', 'pos'].includes(saleType)) {
    throw new AppError(
      '\u0646\u0648\u0639 \u0627\u0644\u0628\u064A\u0639 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D. \u0627\u0644\u0623\u0646\u0648\u0627\u0639 \u0627\u0644\u0645\u062A\u0627\u062D\u0629: retail \u0623\u0648 wholesale \u0623\u0648 pos',
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
    await assertSaleWarehouseAccess(client, userId, existingSale.warehouse_id);
    // Check before changing receipt rows: historical matches may identify only
    // the payment, so deleting that row first would erase their source identity.
    const { accountingService: postingService } = await import('./accountingService.ts');
    await postingService.assertJournalReferenceMutable(client, 'sale', saleId);
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
      data.payment_status !== undefined ||
      data.paid_amount !== undefined ||
      data.payments !== undefined;
    let requestedSettlement: ReturnType<typeof resolveSaleSettlement> | null = null;
    if (providesPaymentInput) {
      try {
        requestedSettlement = resolveSaleSettlement({
          ...data,
          total_amount: totalAmount,
          payment_method: data.payment_method || existingSale.payment_method || 'cash',
          payment_status:
            Array.isArray(data.payments) && data.payments.length === 0
              ? 'unpaid'
              : data.payment_status || existingSale.payment_status || 'paid',
        });
      } catch (error) {
        throw new AppError(error instanceof Error ? error.message : 'بيانات الدفع غير صالحة', 400);
      }
    }
    const requestedPaidAmount = requestedSettlement?.paid_amount ?? null;
    const warehouseId =
      shouldReplaceItems && items.length
        ? await resolveSaleWarehouseId(items, data.warehouse_id || existingSale.warehouse_id)
        : data.warehouse_id
          ? Number(data.warehouse_id)
          : existingSale.warehouse_id;
    await assertSaleWarehouseAccess(client, userId, warehouseId);
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
      `SELECT COALESCE(SUM(amount), 0)::numeric AS total FROM payments
       WHERE LOWER(TRIM(COALESCE(payment_method, 'cash'))) <> 'credit'
         AND ((reference_type = 'sale' AND reference_id = $1)
          OR (reference_type = 'invoice' AND reference_id IN (SELECT id FROM invoices WHERE sale_id = $1)))`,
      [saleId],
    );
    const existingPaid = Number(existingPaidRes.rows[0].total || 0);
    const targetPaid = requestedPaidAmount === null ? existingPaid : requestedPaidAmount;
    if (targetPaid > totalAmount) {
      throw new AppError(
        'التحصيلات المحفوظة تتجاوز إجمالي الفاتورة؛ يلزم تسويتها قبل التعديل',
        409,
      );
    }

    if (Array.isArray(data.payments) && requestedSettlement) {
      await settleSalePaymentAllocations(client, saleId, userId, requestedSettlement.payments);
    } else if (targetPaid > existingPaid + 1e-9) {
      await client.query(
        `INSERT INTO payments (payment_number, reference_type, reference_id, amount, payment_method, user_id)
         VALUES ($1,'sale',$2,$3,$4,$5)`,
        [
          `PAY-${saleId}-${Date.now()}`,
          saleId,
          roundMoney(targetPaid - existingPaid),
          requestedSettlement?.payments[0]?.payment_method || 'cash',
          userId,
        ],
      );
    } else if (targetPaid < existingPaid - 1e-9) {
      // تقليص المدفوع من أحدث دفعة لأقدمها، مع تعديل جزئي لآخر دفعة عند الحاجة
      let excess = roundMoney(existingPaid - targetPaid);
      const payRows = (
        await client.query(
          `SELECT p.id, p.amount FROM payments p
           WHERE LOWER(TRIM(COALESCE(p.payment_method, 'cash'))) <> 'credit'
             AND NOT ${standalonePaymentSourceSql('p')}
             AND ((p.reference_type = 'sale' AND p.reference_id = $1)
              OR (p.reference_type = 'invoice' AND p.reference_id IN (SELECT id FROM invoices WHERE sale_id = $1)))
           ORDER BY p.id DESC FOR UPDATE`,
          [saleId],
        )
      ).rows;
      const mutableAmount = roundMoney(payRows.reduce((sum, pay) => sum + Number(pay.amount), 0));
      if (mutableAmount < excess)
        throw new AppError(
          'لا يمكن تخفيض تحصيل مُرحّل من تعديل البيع؛ استخدم تسوية التحصيل أو المرتجع',
          409,
        );
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
      targetPaid >= totalAmount ? 'paid' : targetPaid > 0 ? 'partial' : 'unpaid';
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
    const savedPayments = (
      await client.query(
        `SELECT p.payment_method, p.amount, p.payment_number FROM payments p
         WHERE LOWER(TRIM(COALESCE(p.payment_method, 'cash'))) <> 'credit'
           AND NOT ${standalonePaymentSourceSql('p')}
           AND ((p.reference_type = 'sale' AND p.reference_id = $1)
            OR (p.reference_type = 'invoice' AND p.reference_id IN (SELECT id FROM invoices WHERE sale_id = $1)))`,
        [saleId],
      )
    ).rows;
    await accountingService.deleteJournalEntryByReference(client, 'sale', saleId);
    await accountingService.postSaleJournalEntry(client, {
      id: saleId,
      sale_number: existingSale.sale_number,
      sale_type: saleType,
      total_amount: totalAmount,
      cost_amount: costAmount,
      tax_amount: totals.taxAmount || 0,
      payment_method: data.payment_method || existingSale.payment_method || 'cash',
      payment_status: finalPaymentStatus,
      paid_amount: targetPaid,
      payments: savedPayments,
      customer_id: customerId,
      warehouse_id: warehouseId,
      user_id: userId,
      sale_date: saleDate
        ? saleDate.toISOString?.().slice(0, 10) || String(saleDate).slice(0, 10)
        : undefined,
    });

    await client.query('COMMIT');
    broadcast('sales_changed', { action: 'update', sale_id: saleId });
    // حدث أتمتة فوري غير حاجب: فحص الخصم الكبير عند تعديل الفاتورة
    emitAutomationEvent('large_discount_alert', {
      sale_id: saleId,
      sale_number: existingSale.sale_number,
      subtotal: Number(totals.subtotal || existingSale.subtotal || 0),
      discount_amount: Number(totals.discountAmount || existingSale.discount_amount || 0),
      cashier_user_id: userId,
    });
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
const getSales = async (filters: Record<string, any> = {}, allowedWarehouseIds?: number[]) => {
  return await salesRepository.getSalesList({
    ...filters,
    ...(allowedWarehouseIds ? { warehouse_ids: allowedWarehouseIds } : {}),
  });
};
/**
 * ملخص المبيعات حسب النوع والتاريخ.
 * @param {Record<string, any>} [filters] خيارات الفلترة (sale_type, from_date, to_date)
 * @returns {Promise<any[]>}
 */
const getSalesSummary = async (
  filters: Record<string, any> = {},
  allowedWarehouseIds?: number[],
) => {
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
  if (filters.warehouse_id) {
    sql += ` AND warehouse_id = $${idx++}`;
    params.push(Number(filters.warehouse_id));
  }
  if (filters.from_date) {
    sql += ` AND sale_date >= $${idx++}`;
    params.push(filters.from_date);
  }
  if (filters.to_date) {
    sql += ` AND sale_date <= $${idx++}`;
    params.push(filters.to_date);
  }
  if (allowedWarehouseIds) {
    sql += ` AND warehouse_id = ANY($${idx}::int[])`;
    params.push(allowedWarehouseIds.map(Number));
  }
  sql += ` GROUP BY sale_type, sale_date ORDER BY sale_date DESC`;
  return (await query(sql, params)).rows;
};
/** جلب بيع واحد كاملاً مع الأصناف مع التحقق من عزل المخازن للمستخدم. */
const getSaleById = async (id: number, allowedWarehouseIds?: number[]) => {
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
  if (!result.rows[0]) throw new AppError('عملية البيع غير موجودة', 404);

  const sale = result.rows[0];
  if (allowedWarehouseIds && !allowedWarehouseIds.includes(Number(sale.warehouse_id))) {
    throw new AppError('غير مصرح لك بالاطلاع على مبيعات هذا المخزن', 403);
  }

  return sale;
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

    if (sale.deleted_at || sale.status !== 'completed' || sale.payment_status === 'refunded') {
      throw new AppError('لا يمكن إرجاع بيع محذوف أو ملغى أو غير مكتمل', 409);
    }

    await assertSaleWarehouseAccess(client, userId, sale.warehouse_id);
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

    // استعلام عن مدفوعات الفاتورة الفعلية لتحديد وسيلة الرد ومبلغ الكاش الفعلي
    const paymentsRes = await client.query(
      `SELECT p.payment_method, p.amount FROM payments p
       WHERE (p.reference_type = 'sale' AND p.reference_id = $1)
          OR (p.reference_type = 'invoice' AND p.reference_id IN
              (SELECT id FROM invoices WHERE sale_id = $1))`,
      [saleId],
    );
    const allSalePayments = paymentsRes.rows;
    const salePayments = allSalePayments.filter(
      (payment: any) => (payment.payment_method || 'cash').trim().toLowerCase() !== 'credit',
    );
    // Older paid POS sales without payment rows use the same cash fallback as shift reports.
    if (!allSalePayments.length && sale.pos_shift_id && sale.payment_status === 'paid') {
      salePayments.push({ payment_method: 'cash', amount: Number(sale.total_amount) });
    }
    const receivedAmount = roundMoney(
      salePayments.reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0),
    );
    if (receivedAmount > roundMoney(Number(sale.total_amount))) {
      throw new AppError('مدفوعات البيع تتجاوز إجمالي الفاتورة؛ يلزم مراجعتها قبل المرتجع', 409);
    }
    const cashPaidAmount = roundMoney(
      salePayments
        .filter((p: any) =>
          ['cash', 'نقد', 'نقدي'].includes((p.payment_method || 'cash').toLowerCase()),
        )
        .reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0),
    );

    // إذا كانت الفاتورة المرتجعة سُدد منها نقداً، وكان للمستخدم وردية POS مفتوحة، نسجل حركة سحب نقدي بما سُدد نقداً فقط
    if (cashPaidAmount > 0) {
      const activeShiftRes = await client.query(
        `SELECT id FROM pos_shifts WHERE cashier_user_id = $1 AND warehouse_id = $2 AND status = 'open' LIMIT 1 FOR UPDATE`,
        [userId, sale.warehouse_id],
      );
      if (sale.pos_shift_id && !activeShiftRes.rows.length) {
        throw new AppError('افتح وردية في مخزن الفاتورة لتسجيل رد النقدية للمرتجع', 409);
      }
      if (activeShiftRes.rows.length > 0) {
        await client.query(
          `INSERT INTO pos_cash_movements (shift_id, movement_type, amount, reason, authorized_by)
           VALUES ($1, 'expense', $2, $3, $4)`,
          [
            activeShiftRes.rows[0].id,
            cashPaidAmount,
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
      payment_method:
        salePayments[0]?.payment_method ||
        (allSalePayments.length > 0 ? allSalePayments[0].payment_method : 'cash'),
      payments: salePayments,
      customer_id: sale.customer_id,
      warehouse_id: sale.warehouse_id,
      user_id: userId,
    });

    await client.query('COMMIT');
    broadcast('sales_changed', { action: 'return', sale_id: saleId });
    // حدث أتمتة فوري غير حاجب: كشف إلغاء/إرجاع الفواتير (رقم الفاتورة والمبلغ والكاشير)
    emitAutomationEvent('void_invoice_alert', {
      sale_id: saleId,
      sale_number: sale.sale_number,
      total_amount: Number(sale.total_amount),
      cashier_user_id: sale.user_id,
      returned_by: userId,
    });
    return getSaleById(saleId);
  } catch (err: any) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};
/** حذف مبيعات المخازن المسموح بها فقط. */
const deleteAllSales = async (userId: number, allowedWarehouseIds?: number[]) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const scope = allowedWarehouseIds ? 'AND warehouse_id = ANY($1::int[])' : '';
    const params = allowedWarehouseIds ? [allowedWarehouseIds.map(Number)] : [];
    const salesToDelete = await client.query(
      `SELECT id, status, customer_id FROM sales WHERE deleted_at IS NULL ${scope} FOR UPDATE`,
      params,
    );
    const saleIds = salesToDelete.rows.map((sale) => sale.id);
    const deletedCount = saleIds.length;
    if (deletedCount > 0) {
      const customerIds = [
        ...new Set(salesToDelete.rows.map((sale) => sale.customer_id).filter(Boolean)),
      ];
      for (const sale of salesToDelete.rows) {
        if (sale.status === 'returned') continue;
        await restoreInventoryForSale(client, sale.id, userId);
        const { accountingService } = await import('./accountingService.ts');
        await accountingService.deleteJournalEntryByReference(client, 'sale', sale.id);
      }
      await client.query(
        `UPDATE sales
         SET deleted_at = NOW(), status = 'cancelled', updated_at = NOW()
         WHERE id = ANY($1::int[])`,
        [saleIds],
      );
      await client.query(
        `UPDATE invoices
         SET deleted_at = NOW()
         WHERE sale_id = ANY($1::int[]) AND deleted_at IS NULL`,
        [saleIds],
      );
      for (const customerId of customerIds) {
        await recalculateCustomerBalance(
          (text, queryParams) => client.query(text, queryParams),
          customerId,
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
const deleteSalesByDate = async (
  saleDate: string,
  userId: number,
  allowedWarehouseIds?: number[],
) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(saleDate || ''))) {
    throw new AppError(
      '\u062A\u0627\u0631\u064A\u062E \u0627\u0644\u0628\u064A\u0639 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D. \u0627\u0644\u0635\u064A\u063A\u0629 \u0627\u0644\u0645\u0637\u0644\u0648\u0628\u0629 YYYY-MM-DD',
      400,
    );
  }
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const scope = allowedWarehouseIds ? 'AND warehouse_id = ANY($2::int[])' : '';
    const params = allowedWarehouseIds ? [saleDate, allowedWarehouseIds.map(Number)] : [saleDate];
    const salesToDelete = await client.query(
      `SELECT id, status, customer_id
       FROM sales
       WHERE deleted_at IS NULL AND sale_date = $1::date ${scope}
       FOR UPDATE`,
      params,
    );
    const saleIds = salesToDelete.rows.map((sale) => sale.id);
    const deletedCount = saleIds.length;
    if (deletedCount > 0) {
      const customerIds = [
        ...new Set(salesToDelete.rows.map((sale) => sale.customer_id).filter(Boolean)),
      ];
      for (const sale of salesToDelete.rows) {
        if (sale.status === 'returned') continue;
        await restoreInventoryForSale(client, sale.id, userId);
        const { accountingService } = await import('./accountingService.ts');
        await accountingService.deleteJournalEntryByReference(client, 'sale', sale.id);
      }
      await client.query(
        `UPDATE sales
         SET deleted_at = NOW(), status = 'cancelled', updated_at = NOW()
         WHERE id = ANY($1::int[])`,
        [saleIds],
      );
      await client.query(
        `UPDATE invoices i
         SET deleted_at = NOW()
         WHERE i.deleted_at IS NULL AND i.sale_id = ANY($1::int[])`,
        [saleIds],
      );
      for (const customerId of customerIds) {
        await recalculateCustomerBalance(
          (text, queryParams) => client.query(text, queryParams),
          customerId,
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
    broadcast('sales_changed', { action: 'delete_date', date: saleDate });
    return { deletedCount, saleDate };
  } catch (err: any) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};
/** حذف المبيعات حسب النوع (retail/wholesale). */
const deleteSalesByType = async (
  saleType: string,
  userId: number,
  allowedWarehouseIds?: number[],
) => {
  if (!['retail', 'wholesale'].includes(saleType)) {
    throw new AppError('نوع البيع غير صالح', 400);
  }
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const scope = allowedWarehouseIds ? 'AND warehouse_id = ANY($2::int[])' : '';
    const params = allowedWarehouseIds ? [saleType, allowedWarehouseIds.map(Number)] : [saleType];
    const salesToDelete = await client.query(
      `SELECT id, status, customer_id FROM sales
       WHERE deleted_at IS NULL AND sale_type = $1 ${scope}
       FOR UPDATE`,
      params,
    );
    const saleIds = salesToDelete.rows.map((sale) => sale.id);
    const deletedCount = saleIds.length;
    if (deletedCount > 0) {
      const customerIds = [
        ...new Set(salesToDelete.rows.map((sale) => sale.customer_id).filter(Boolean)),
      ];
      for (const sale of salesToDelete.rows) {
        if (sale.status === 'returned') continue;
        await restoreInventoryForSale(client, sale.id, userId);
        const { accountingService } = await import('./accountingService.ts');
        await accountingService.deleteJournalEntryByReference(client, 'sale', sale.id);
      }
      await client.query(
        `UPDATE sales SET deleted_at = NOW(), status = 'cancelled', updated_at = NOW()
         WHERE id = ANY($1::int[])`,
        [saleIds],
      );
      await client.query(
        `UPDATE invoices SET deleted_at = NOW()
         WHERE deleted_at IS NULL AND sale_id = ANY($1::int[])`,
        [saleIds],
      );
      for (const customerId of customerIds) {
        await recalculateCustomerBalance(
          (text, queryParams) => client.query(text, queryParams),
          customerId,
        );
      }
    }
    const typeLabel =
      saleType === 'retail' ? '\u0627\u0644\u0645\u062D\u0644' : '\u062C\u0645\u0644\u0629';
    await client.query(
      `INSERT INTO activity_logs (user_id, module, action_ar, details) VALUES ($1,'sales',$2,$3)`,
      [
        userId,
        `\u062D\u0630\u0641 \u0643\u0644 \u0645\u0628\u064A\u0639\u0627\u062A ${typeLabel}`,
        JSON.stringify({ sale_type: saleType, deleted_count: deletedCount }),
      ],
    );
    await client.query('COMMIT');
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
