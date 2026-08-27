import { query } from '../database/pool.ts';

/**
 * خدمة توقع التدفقات النقدية والسيولة المستقبلية لـ 30 يوماً
 */
export const getCashFlowProjection = async (params: Record<string, any> = {}) => {
  const warehouseId = Number(params.warehouse_id) || 1;

  // 1. حساب السيولة الحالية المتوفرة بالخزنة كخط أساس (Baseline Cash)
  // السيولة التقريبية = إجمالي المبيعات المكتملة - إجمالي المصاريف الموزعة - إجمالي مشتريات المستودع
  const salesSumRes = await query(
    `SELECT COALESCE(SUM(total_amount), 0) AS val
     FROM sales
     WHERE status = 'completed' AND deleted_at IS NULL AND warehouse_id = $1`,
    [warehouseId],
  );
  const expensesSumRes = await query(
    `SELECT COALESCE(SUM(amount), 0) AS val
     FROM expenses
     WHERE deleted_at IS NULL`,
  );
  const purchasesSumRes = await query(
    `SELECT COALESCE(SUM(total_amount), 0) AS val
     FROM purchase_invoices
     WHERE deleted_at IS NULL AND warehouse_id = $1`,
    [warehouseId],
  );

  const activeWarehousesRes = await query(
    `SELECT COUNT(*)::numeric AS count FROM warehouses WHERE deleted_at IS NULL AND is_active = TRUE`,
  );
  const warehousesCount = Math.max(1, Number(activeWarehousesRes.rows[0]?.count || 1));

  const totalSales = Number(salesSumRes.rows[0].val);
  const totalExpenses = Number(expensesSumRes.rows[0].val);
  const totalPurchases = Number(purchasesSumRes.rows[0].val);

  // نوزع المصاريف العمومية بالتساوي على الفروع/المستودعات لتجنب تشويه الحسابات لفرع واحد
  // الإصلاح: لم نعد نستبدل السيولة السالبة برقم وهمي — نعرضها كما هي حتى تظهر تحذيرات العجز فعلياً
  const currentCash = totalSales - totalExpenses / warehousesCount - totalPurchases;
  const startsInsolvent = currentCash <= 0;

  // 2. حساب متوسط المبيعات اليومية لكل يوم من أيام الأسبوع لآخر 90 يوماً (الموسمية الأسبوعية)
  // نقسم على عدد مرات تكرار كل يوم فعلياً في النافذة بدل ثابت 13 أسبوع
  const salesDensitySql = `
    SELECT
      EXTRACT(DOW FROM sale_date) AS dow,
      COALESCE(SUM(total_amount), 0) AS total_sales
    FROM sales
    WHERE status = 'completed' AND deleted_at IS NULL
      AND warehouse_id = $1
      AND sale_date >= CURRENT_DATE - INTERVAL '90 days'
    GROUP BY dow
  `;
  const salesDensity = (await query(salesDensitySql, [warehouseId])).rows;

  const dowOccurrencesRes = await query(`
    SELECT EXTRACT(DOW FROM d)::int AS dow, COUNT(*)::numeric AS occ
    FROM generate_series(CURRENT_DATE - INTERVAL '89 days', CURRENT_DATE, INTERVAL '1 day') d
    GROUP BY 1
  `);
  const dowOccurrenceMap = {};
  dowOccurrencesRes.rows.forEach((row) => {
    dowOccurrenceMap[Number(row.dow)] = Math.max(1, Number(row.occ));
  });

  const dowSalesMap = {};
  for (let i = 0; i < 7; i++) {
    dowSalesMap[i] = 0.0;
  }
  salesDensity.forEach((row) => {
    const occ = dowOccurrenceMap[Number(row.dow)] || 13;
    dowSalesMap[Number(row.dow)] = Number((Number(row.total_sales) / occ).toFixed(2));
  });

  // 3. حساب متوسط المصاريف اليومية لآخر 90 يوماً
  const expensesAvgRes = await query(
    `SELECT COALESCE(SUM(amount), 0) / 90.0 AS avg_daily
     FROM expenses
     WHERE deleted_at IS NULL AND expense_date >= CURRENT_DATE - INTERVAL '90 days'`,
  );
  const avgDailyExpenses = Number(Number(expensesAvgRes.rows[0].avg_daily || 0).toFixed(2));

  // 4. حساب متوسط المشتريات وتوريد البضاعة اليومي لآخر 90 يوماً (فلترة حسب المستودع)
  const purchasesAvgRes = await query(
    `SELECT COALESCE(SUM(total_amount), 0) / 90.0 AS avg_daily
     FROM purchase_invoices
     WHERE deleted_at IS NULL AND warehouse_id = $1 AND invoice_date >= CURRENT_DATE - INTERVAL '90 days'`,
    [warehouseId],
  );
  const avgDailyPurchases = Number(Number(purchasesAvgRes.rows[0].avg_daily || 0).toFixed(2));

  // 5. محاكاة حركة النقدية اليومية لـ 30 يوماً قادمة
  const projectionDays = 30;
  const dailyPoints: any[] = [];
  let cashTracker = currentCash;
  let runwayDays: number | null = startsInsolvent ? 0 : null;
  const today = new Date();

  const dayNamesAr = {
    0: 'الأحد',
    1: 'الإثنين',
    2: 'الثلاثاء',
    3: 'الأربعاء',
    4: 'الخميس',
    5: 'الجمعة',
    6: 'السبت',
  };

  for (let i = 1; i <= projectionDays; i++) {
    const futureDate = new Date(today);
    futureDate.setDate(today.getDate() + i);
    const dow = futureDate.getDay();

    const projectedIn = dowSalesMap[dow] || 0;
    const projectedOut = avgDailyExpenses / warehousesCount + avgDailyPurchases;

    cashTracker = cashTracker + projectedIn - projectedOut;

    if (cashTracker < 0 && runwayDays === null) {
      runwayDays = i;
    }

    dailyPoints.push({
      date: futureDate.toISOString().split('T')[0],
      day_name: dayNamesAr[dow],
      projected_in: Number(projectedIn.toFixed(2)),
      projected_out: Number(projectedOut.toFixed(2)),
      balance: Number(cashTracker.toFixed(2)),
    });
  }

  // 6. تحديد التحذيرات والتوصيات بناءً على النتائج
  const endingBalance = dailyPoints[dailyPoints.length - 1].balance;
  const netChange = Number((endingBalance - currentCash).toFixed(2));

  let warningMsg =
    'الوضع المالي مستقر تماماً. الإيرادات المتوقعة تغطي مصاريف التشغيل والمشتريات بنجاح دون أية فجوات نقدية للـ 30 يوماً القادمة.';
  let status = 'healthy'; // healthy, warning, danger

  if (startsInsolvent) {
    status = 'danger';
    warningMsg = `تحذير حرج: السيولة الحالية سالبة (${currentCash.toFixed(2)} ج.م). المصاريف والمشتريات التاريخية تتجاوز المبيعات — يلزم تدخل فوري لتحسين التحصيل أو خفض النفقات.`;
  } else if (runwayDays !== null) {
    status = 'danger';
    warningMsg = `تنبيه عجز نقدي حرج! تشير المحاكاة إلى نفاد السيولة النقدية لديك تماماً بعد ${runwayDays} يوم بسبب زيادة معدلات الإنفاق والمشتريات عن المبيعات. يرجى ترشيد النفقات أو تعزيز المبيعات فوراً لتجنب العجز.`;
  } else if (netChange < 0) {
    status = 'warning';
    warningMsg = `تنبيه: هناك انخفاض تدريجي متوقع في السيولة النقدية بمقدار ${Math.abs(netChange)} ج.م بنهاية الـ 30 يوماً. نوصي بمراجعة بنود المشتريات اليومية لضمان بقاء التدفق النقدي إيجابياً.`;
  }

  return {
    currentBalance: Number(currentCash.toFixed(2)),
    projectedBalance30d: Number(endingBalance.toFixed(2)),
    netChange,
    runwayDays,
    status,
    warningMsg,
    dailyPoints,
  };
};
