/**
 * services/shiftClosingService.ts — إقفال وردية الكاشير ومطابقة الدرج
 * ════════════════════════════════════════════════════════════════
 * يتيح للكاشير والمدير إقفال الوردية النقدية، مطابقة المبيعات النقدية
 * والمدفوعات الإلكترونية، وحساب الفارق (عجز/فائض) في درج الكاشير.
 */
import { query, withTransaction } from '../database/pool.ts';
import { roundMoney } from '../utils/money.ts';

export interface ShiftSummary {
  userId: number;
  warehouseId?: number;
  startTime: string;
  endTime: string;
  totalCashSales: number;
  totalCardSales: number;
  totalReturns: number;
  totalExpenses: number;
  expectedCash: number;
  salesCount: number;
}

/**
 * جلب ملخص الوردية الحالية للمستخدم قبل الإقفال
 */
export const getShiftSummary = async (
  userId: number,
  startTime: string,
  endTime: string = new Date().toISOString(),
  warehouseId?: number,
): Promise<ShiftSummary> => {
  const params: any[] = [userId, startTime, endTime];
  let warehouseClause = '';

  if (warehouseId) {
    params.push(warehouseId);
    warehouseClause = ` AND s.warehouse_id = $${params.length}`;
  }

  // 1. مبيعات الوردية
  const salesRes = await query(
    `SELECT 
       COUNT(*) as sales_count,
       COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total_amount ELSE 0 END), 0) as cash_sales,
       COALESCE(SUM(CASE WHEN payment_method != 'cash' THEN total_amount ELSE 0 END), 0) as card_sales,
       COALESCE(SUM(CASE WHEN status = 'returned' THEN total_amount ELSE 0 END), 0) as total_returns
     FROM sales s
     WHERE s.user_id = $1 
       AND s.created_at >= $2 
       AND s.created_at <= $3 
       AND s.deleted_at IS NULL
       ${warehouseClause}`,
    params,
  );

  // 2. مصروفات الوردية للمستخدم
  const expRes = await query(
    `SELECT COALESCE(SUM(amount), 0) as total_expenses
     FROM expenses
     WHERE user_id = $1 AND created_at >= $2 AND created_at <= $3 AND deleted_at IS NULL`,
    [userId, startTime, endTime],
  );

  const row = salesRes.rows[0] || {};
  const expRow = expRes.rows[0] || {};

  const totalCashSales = roundMoney(Number(row.cash_sales || 0));
  const totalCardSales = roundMoney(Number(row.card_sales || 0));
  const totalReturns = roundMoney(Number(row.total_returns || 0));
  const totalExpenses = roundMoney(Number(expRow.total_expenses || 0));
  const expectedCash = roundMoney(Math.max(0, totalCashSales - totalReturns - totalExpenses));

  return {
    userId,
    warehouseId,
    startTime,
    endTime,
    totalCashSales,
    totalCardSales,
    totalReturns,
    totalExpenses,
    expectedCash,
    salesCount: Number(row.sales_count || 0),
  };
};

/**
 * إقفال الوردية وتسجيل الفروقات في قاعدة البيانات
 */
export const closeShift = async (data: {
  userId: number;
  warehouseId?: number;
  startTime: string;
  actualCash: number;
  notes?: string;
}) => {
  const endTime = new Date().toISOString();
  const summary = await getShiftSummary(data.userId, data.startTime, endTime, data.warehouseId);
  const actualCash = roundMoney(Number(data.actualCash || 0));
  const difference = roundMoney(actualCash - summary.expectedCash);

  return await withTransaction(async (client) => {
    // تسجيل ملخص إقفال الوردية في سجل النشاطات وسجل المراجعة
    const details = {
      ...summary,
      actualCash,
      difference,
      notes: data.notes || '',
      closedAt: endTime,
    };

    await client.query(
      `INSERT INTO activity_logs (user_id, module, action_ar, details)
       VALUES ($1, 'pos_shift', 'إقفال وردية كاشير ومطابقة النقدية', $2)`,
      [data.userId, JSON.stringify(details)],
    );

    return details;
  });
};
