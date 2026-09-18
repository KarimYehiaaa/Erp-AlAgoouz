/**
 * posShiftService.ts — خدمة إدارة ورديات الكاشير ومطابقة النقدية
 * تغطي: فتح الوردية، تسجيل السحب والإيداع، الاستعلام عن الوردية النشطة، وإغلاق الوردية (Z-Report).
 */
import { query, getClient } from '../database/pool.ts';
import { AppError } from '../types/errors.ts';
import { roundMoney } from '../utils/money.ts';

export interface OpenShiftData {
  terminal_id?: number;
  warehouse_id?: number;
  opening_cash: number;
  notes?: string;
}

export interface CloseShiftData {
  actual_cash: number;
  notes?: string;
}

export interface CashMovementData {
  shift_id: number;
  movement_type: 'drop' | 'deposit' | 'expense';
  amount: number;
  reason: string;
}

export interface ShiftStats {
  invoices_count: number;
  total_sales_amount: number;
  total_cash_sales: number;
  total_card_sales: number;
  total_transfer_sales: number;
  total_credit_sales: number;
  total_refunds_amount: number;
  total_discounts: number;
  total_deposits: number;
  total_withdrawals: number;
  expected_cash: number;
}

async function calculateShiftMetrics(
  db: { query: (sql: string, params?: any[]) => Promise<any> },
  shiftId: number,
  openingCash: number,
): Promise<ShiftStats> {
  const salesStatsRes = await db.query(
    `WITH shift_sales AS (
       SELECT id, total_amount, payment_status, status, discount_amount
       FROM sales
       WHERE pos_shift_id = $1 AND deleted_at IS NULL
     ),
     sale_payments AS (
       SELECT
         p.reference_id as sale_id,
         LOWER(COALESCE(p.payment_method, 'cash')) as method,
         p.amount
       FROM payments p
       WHERE p.reference_type = 'sale'
         AND p.reference_id IN (SELECT id FROM shift_sales WHERE status = 'completed')
       UNION ALL
       SELECT
         i.sale_id,
         LOWER(COALESCE(p.payment_method, 'cash')) as method,
         p.amount
       FROM payments p
       JOIN invoices i ON p.reference_id = i.id
       WHERE p.reference_type = 'invoice'
         AND i.sale_id IN (SELECT id FROM shift_sales WHERE status = 'completed')
     ),
     fallback_sales AS (
       SELECT
         s.id as sale_id,
         'cash' as method,
         s.total_amount as amount
       FROM shift_sales s
       WHERE s.status = 'completed'
         AND s.payment_status = 'paid'
         AND s.id NOT IN (SELECT sale_id FROM sale_payments)
     ),
     all_payments AS (
       SELECT * FROM sale_payments
       UNION ALL
       SELECT * FROM fallback_sales
     )
     SELECT
       (SELECT COUNT(*) FROM shift_sales WHERE status = 'completed') as total_invoices_count,
       (SELECT COALESCE(SUM(total_amount), 0) FROM shift_sales WHERE status = 'completed') as live_total_sales,
       (SELECT COALESCE(SUM(discount_amount), 0) FROM shift_sales WHERE status = 'completed') as live_total_discounts,
       (SELECT COALESCE(SUM(total_amount), 0) FROM shift_sales WHERE status = 'returned' OR payment_status = 'refunded') as live_total_refunds,
       COALESCE(SUM(CASE WHEN method IN ('cash', 'نقد', 'نقدي') THEN amount ELSE 0 END), 0) as live_cash_sales,
       COALESCE(SUM(CASE WHEN method IN ('card', 'visa', 'mastercard', 'pos_terminal', 'mada', 'شبكة') THEN amount ELSE 0 END), 0) as live_card_sales,
       COALESCE(SUM(CASE WHEN method IN ('transfer', 'bank_transfer', 'instapay', 'vodafone_cash', 'wallet', 'محفظة', 'تحويل') THEN amount ELSE 0 END), 0) as live_transfer_sales,
       COALESCE(SUM(CASE WHEN method NOT IN ('cash', 'نقد', 'نقدي', 'card', 'visa', 'mastercard', 'pos_terminal', 'mada', 'شبكة', 'transfer', 'bank_transfer', 'instapay', 'vodafone_cash', 'wallet', 'محفظة', 'تحويل') THEN amount ELSE 0 END), 0) as live_other_sales,
       COALESCE(SUM(amount), 0) as live_total_paid
     FROM all_payments`,
    [shiftId],
  );

  const movesStatsRes = await db.query(
    `SELECT 
       COALESCE(SUM(CASE WHEN movement_type = 'deposit' THEN amount ELSE 0 END), 0) as total_deposits,
       COALESCE(SUM(CASE WHEN movement_type IN ('drop', 'expense') THEN amount ELSE 0 END), 0) as total_withdrawals
     FROM pos_cash_movements
     WHERE shift_id = $1`,
    [shiftId],
  );

  const stats = salesStatsRes.rows[0] || {};
  const moves = movesStatsRes.rows[0] || {};

  const totalSalesAmount = roundMoney(Number(stats.live_total_sales || 0));
  const liveCashSales = roundMoney(Number(stats.live_cash_sales || 0));
  const liveCardSales = roundMoney(Number(stats.live_card_sales || 0));
  const liveTransferSales = roundMoney(Number(stats.live_transfer_sales || 0));
  const liveTotalPaid = roundMoney(Number(stats.live_total_paid || 0));
  const liveTotalRefunds = roundMoney(Number(stats.live_total_refunds || 0));
  const liveTotalDiscounts = roundMoney(Number(stats.live_total_discounts || 0));
  const totalInvoicesCount = Number(stats.total_invoices_count || 0);

  const totalCreditSales = Math.max(0, roundMoney(totalSalesAmount - liveTotalPaid));
  const deposits = roundMoney(Number(moves.total_deposits || 0));
  const withdrawals = roundMoney(Number(moves.total_withdrawals || 0));

  const expectedCash = roundMoney(Number(openingCash) + liveCashSales + deposits - withdrawals);

  return {
    invoices_count: totalInvoicesCount,
    total_sales_amount: totalSalesAmount,
    total_cash_sales: liveCashSales,
    total_card_sales: liveCardSales,
    total_transfer_sales: liveTransferSales,
    total_credit_sales: totalCreditSales,
    total_refunds_amount: liveTotalRefunds,
    total_discounts: liveTotalDiscounts,
    total_deposits: deposits,
    total_withdrawals: withdrawals,
    expected_cash: expectedCash,
  };
}

export const posShiftService = {
  /**
   * فتح وردية كاشير جديدة
   */
  async openShift(userId: number, data: OpenShiftData) {
    // 1. التأكد من عدم وجود وردية مفتوحة لنفس المستخدم
    const activeRes = await query(
      `SELECT id, shift_number FROM pos_shifts WHERE cashier_user_id = $1 AND status = 'open' LIMIT 1`,
      [userId],
    );
    if (activeRes.rows.length > 0) {
      return activeRes.rows[0];
    }

    // 2. تحديد المخزن / الفرع الافتراضي إذا لم يتم تمريره
    let warehouseId = data.warehouse_id;
    if (!warehouseId) {
      const wRes = await query(
        `SELECT id FROM warehouses WHERE deleted_at IS NULL ORDER BY id ASC LIMIT 1`,
      );
      warehouseId = wRes.rows[0]?.id;
    }

    // 3. تحديد الجهاز
    let terminalId = data.terminal_id;
    if (!terminalId) {
      const tRes = await query(
        `SELECT id FROM pos_terminals WHERE is_active = TRUE ORDER BY id ASC LIMIT 1`,
      );
      terminalId = tRes.rows[0]?.id || null;
    }

    const shiftNumber = `SHF-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now().toString().slice(-4)}`;
    const openingCash = Number(data.opening_cash || 0);

    const insertRes = await query(
      `INSERT INTO pos_shifts (
        shift_number, terminal_id, warehouse_id, cashier_user_id,
        opening_cash, expected_cash, status, notes
      ) VALUES ($1, $2, $3, $4, $5, $5, 'open', $6)
      RETURNING *`,
      [shiftNumber, terminalId, warehouseId, userId, openingCash, data.notes || null],
    );

    return insertRes.rows[0];
  },

  /**
   * جلب تفاصيل الوردية النشطة للكاشير الحالي مع الإحصائيات المباشرة
   */
  async getCurrentShift(userId: number) {
    const shiftRes = await query(
      `SELECT s.*, u.full_name as cashier_name, w.name_ar as warehouse_name, t.name_ar as terminal_name, t.terminal_code
       FROM pos_shifts s
       JOIN users u ON s.cashier_user_id = u.id
       JOIN warehouses w ON s.warehouse_id = w.id
       LEFT JOIN pos_terminals t ON s.terminal_id = t.id
       WHERE s.cashier_user_id = $1 AND s.status = 'open'
       ORDER BY s.id DESC LIMIT 1`,
      [userId],
    );

    if (shiftRes.rows.length === 0) {
      return null;
    }

    const shift = shiftRes.rows[0];
    const metrics = await calculateShiftMetrics({ query }, shift.id, Number(shift.opening_cash));

    return {
      ...shift,
      ...metrics,
      total_invoices_count: metrics.invoices_count,
      live_total_sales: metrics.total_sales_amount,
      live_cash_sales: metrics.total_cash_sales,
      live_total_discounts: metrics.total_discounts,
    };
  },

  /**
   * تسجيل حركة نقدية (توريد نقدية للخزينة أو إيداع فكة)
   */
  async recordCashMovement(userId: number, data: CashMovementData) {
    const shiftRes = await query(
      `SELECT id, status FROM pos_shifts WHERE id = $1 AND cashier_user_id = $2`,
      [data.shift_id, userId],
    );

    if (shiftRes.rows.length === 0 || shiftRes.rows[0].status !== 'open') {
      throw new AppError('الوردية غير موجودة أو مغلقة', 400);
    }

    const amount = Number(data.amount);
    if (amount <= 0) {
      throw new AppError('يجب أن يكون المبلغ أكبر من صفر', 400);
    }

    const res = await query(
      `INSERT INTO pos_cash_movements (shift_id, movement_type, amount, reason, authorized_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [data.shift_id, data.movement_type, amount, data.reason, userId],
    );

    const movement = res.rows[0];
    try {
      const { accountingService } = await import('./accountingService.ts');
      await accountingService.postShiftCashMovementJournalEntry(null, {
        id: movement.id,
        shift_id: movement.shift_id,
        movement_type: movement.movement_type,
        amount: movement.amount,
        reason: movement.reason,
        user_id: userId,
      });
    } catch (accErr: any) {
      console.warn(`[Accounting] تعذر ترحيل حركة نقدية الوردية تلقائياً: ${accErr.message}`);
    }

    return movement;
  },

  /**
   * إغلاق الوردية وإصدار تقرير Z-Report ومطابقة النقدية بشكل ذري وآمن ضد الـ Race Conditions
   */
  async closeShift(userId: number, shiftId: number, data: CloseShiftData) {
    const actualCash = Number(data.actual_cash);
    const client = await getClient();
    try {
      await client.query('BEGIN');

      // قفل صف الوردية للتحقق الذري ومنع الـ Race Condition
      const shiftRes = await client.query(
        `SELECT s.*, u.full_name as cashier_name, w.name_ar as warehouse_name
         FROM pos_shifts s
         JOIN users u ON s.cashier_user_id = u.id
         JOIN warehouses w ON s.warehouse_id = w.id
         WHERE s.id = $1 AND s.cashier_user_id = $2 AND s.status = 'open'
         FOR UPDATE`,
        [shiftId, userId],
      );

      if (shiftRes.rows.length === 0) {
        throw new AppError('الوردية المحددة غير نشطة أو تم إغلاقها بالفعل', 400);
      }

      const shift = shiftRes.rows[0];
      const metrics = await calculateShiftMetrics(client, shiftId, Number(shift.opening_cash));
      const cashDifference = roundMoney(actualCash - metrics.expected_cash);

      const updateRes = await client.query(
        `UPDATE pos_shifts SET
           closed_at = NOW(),
           actual_cash = $1,
           expected_cash = $2,
           cash_difference = $3,
           total_sales_amount = $4,
           total_cash_sales = $5,
           total_card_sales = $6,
           total_credit_sales = $7,
           total_refunds_amount = $8,
           status = 'closed',
           notes = COALESCE($9, notes),
           updated_at = NOW()
         WHERE id = $10 AND status = 'open'
         RETURNING *`,
        [
          actualCash,
          metrics.expected_cash,
          cashDifference,
          metrics.total_sales_amount,
          metrics.total_cash_sales,
          metrics.total_card_sales,
          metrics.total_credit_sales,
          metrics.total_refunds_amount,
          data.notes || null,
          shiftId,
        ],
      );

      if (Math.abs(cashDifference) > 0.01) {
        try {
          const { accountingService } = await import('./accountingService.ts');
          await accountingService.postShiftDifferenceJournalEntry(client, {
            id: shiftId,
            shift_number: shift.shift_number || `SHIFT-${shiftId}`,
            cash_difference: cashDifference,
            user_id: userId,
          });
        } catch (accErr: any) {
          console.warn(`[Accounting] تعذر ترحيل فرق نقدية الوردية تلقائياً: ${accErr.message}`);
        }
      }

      await client.query('COMMIT');
      return {
        ...updateRes.rows[0],
        ...metrics,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  /**
   * جلب قائمة الورديات السابقة للتقارير
   */
  async listShifts(filters: Record<string, any> = {}) {
    let sql = `
      SELECT s.*, u.full_name as cashier_name, w.name_ar as warehouse_name
      FROM pos_shifts s
      JOIN users u ON s.cashier_user_id = u.id
      JOIN warehouses w ON s.warehouse_id = w.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let i = 1;

    if (filters.warehouse_id) {
      sql += ` AND s.warehouse_id = $${i++}`;
      params.push(filters.warehouse_id);
    }
    if (filters.cashier_id) {
      sql += ` AND s.cashier_user_id = $${i++}`;
      params.push(filters.cashier_id);
    }
    if (filters.status) {
      sql += ` AND s.status = $${i++}`;
      params.push(filters.status);
    }

    sql += ` ORDER BY s.id DESC LIMIT 50`;
    const res = await query(sql, params);
    return res.rows;
  },
};
