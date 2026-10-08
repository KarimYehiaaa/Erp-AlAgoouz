import { effectivePostedJournalSql } from '../utils/journalPosting.ts';
import { query } from '../database/pool.ts';
import { businessToday, shiftCalendarDate } from '../utils/localDate.ts';

/**
 * خدمة توقع التدفقات النقدية والسيولة المستقبلية لـ 30 يوماً
 */
export const getCashFlowProjection = async (params: Record<string, any> = {}) => {
  // Kept for API compatibility. Liquidity and treasury accounts belong to the shop,
  // while the warehouse filter is used by inventory projections on the same screen.
  void params;
  const today = businessToday();
  const historyStart = shiftCalendarDate(today, -89);

  // 1. Current liquidity comes from posted balances in the shop's cash, bank,
  // and e-wallet accounts. Sales and invoices are not cash until collected.
  const cashAccountBalance = await query(
    `SELECT COALESCE(SUM(l.debit - l.credit), 0) AS val
     FROM journal_entry_lines l
     JOIN journal_entries e ON e.id = l.journal_entry_id
     JOIN accounts a ON a.id = l.account_id
     WHERE a.code IN ('110101', '110102', '110103', '110104')
       AND ${effectivePostedJournalSql('e')}
       AND e.entry_date <= $1::date`,
    [today],
  );
  const currentCash = Number(cashAccountBalance.rows[0]?.val || 0);
  const startsInsolvent = currentCash <= 0;

  // 2. Average actual posted cash-account receipts and payments per weekday.
  // Exclude opening balances and internal transfers from operating projections.
  const cashMovementDensity = (
    await query(
      `SELECT EXTRACT(DOW FROM e.entry_date)::int AS dow,
              COALESCE(SUM(l.debit), 0) AS total_in,
              COALESCE(SUM(l.credit), 0) AS total_out
       FROM journal_entry_lines l
       JOIN journal_entries e ON e.id = l.journal_entry_id
       JOIN accounts a ON a.id = l.account_id
       WHERE a.code IN ('110101', '110102', '110103', '110104')
         AND ${effectivePostedJournalSql('e')}
         AND e.reference_type IS DISTINCT FROM 'transfer'
         AND e.reference_type IS DISTINCT FROM 'opening'
         AND e.entry_date >= $1::date AND e.entry_date <= $2::date
       GROUP BY EXTRACT(DOW FROM e.entry_date)::int`,
      [historyStart, today],
    )
  ).rows;

  const dowOccurrencesRes = await query(
    `
    SELECT EXTRACT(DOW FROM d)::int AS dow, COUNT(*)::numeric AS occ
    FROM generate_series($1::date::timestamp, $2::date::timestamp, INTERVAL '1 day') d
    GROUP BY 1
  `,
    [historyStart, today],
  );
  const dowOccurrenceMap = {};
  dowOccurrencesRes.rows.forEach((row) => {
    dowOccurrenceMap[Number(row.dow)] = Math.max(1, Number(row.occ));
  });

  const dowInflowMap = {};
  const dowOutflowMap = {};
  for (let i = 0; i < 7; i++) {
    dowInflowMap[i] = 0;
    dowOutflowMap[i] = 0;
  }
  cashMovementDensity.forEach((row) => {
    const occ = dowOccurrenceMap[Number(row.dow)] || 13;
    dowInflowMap[Number(row.dow)] = Number((Number(row.total_in) / occ).toFixed(2));
    dowOutflowMap[Number(row.dow)] = Number((Number(row.total_out) / occ).toFixed(2));
  });

  // 5. محاكاة حركة النقدية اليومية لـ 30 يوماً قادمة
  const projectionDays = 30;
  const dailyPoints: any[] = [];
  let cashTracker = currentCash;
  let runwayDays: number | null = startsInsolvent ? 0 : null;

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
    const futureDate = shiftCalendarDate(today, i);
    const dow = new Date(`${futureDate}T00:00:00Z`).getUTCDay();

    const projectedIn = dowInflowMap[dow] ?? 0;
    const projectedOut = dowOutflowMap[dow] ?? 0;

    cashTracker = cashTracker + projectedIn - projectedOut;

    if (cashTracker < 0 && runwayDays === null) {
      runwayDays = i;
    }

    dailyPoints.push({
      date: futureDate,
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
    warningMsg = `تحذير حرج: رصيد حسابات النقدية والبنك والمحافظ في الأستاذ غير موجب (${currentCash.toFixed(2)} ج.م) — يلزم مراجعة الأرصدة والتحصيلات والمدفوعات فورًا.`;
  } else if (runwayDays !== null) {
    status = 'danger';
    warningMsg = `تنبيه عجز نقدي حرج! تشير المحاكاة إلى نفاد السيولة النقدية لديك تماماً بعد ${runwayDays} يوم بسبب زيادة معدلات الإنفاق والمشتريات عن المبيعات. يرجى ترشيد النفقات أو تعزيز المبيعات فوراً لتجنب العجز.`;
  } else if (netChange < 0) {
    status = 'warning';
    warningMsg = `تنبيه: هناك انخفاض تدريجي متوقع في السيولة النقدية بمقدار ${Math.abs(netChange)} ج.م بنهاية الـ 30 يوماً. نوصي بمراجعة بنود المشتريات اليومية لضمان بقاء التدفق النقدي إيجابياً.`;
  }

  return {
    business_date: today,
    currentBalance: Number(currentCash.toFixed(2)),
    projectedBalance30d: Number(endingBalance.toFixed(2)),
    netChange,
    runwayDays,
    status,
    warningMsg,
    dailyPoints,
  };
};
