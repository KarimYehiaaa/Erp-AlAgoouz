/**
 * plService.js — تقرير الربح والخسارة (P&L)
 *
 * المنطق:
 *  الإيرادات      = مجموع المبيعات المكتملة في الفترة
 *
 *  تكلفة البضاعة = يُفضَّل cost_amount من sale_items (POS)
 *                  وإلا نستخدم المشتريات (purchase_invoices) كتقريب
 *                  لأن المبيعات اليومية (daily) لا تحتوي items
 *
 *  هامش الربح الإجمالي = إيرادات - تكلفة البضاعة
 *
 *  المصاريف التشغيلية = مجموع expenses مُجمَّعة بالتصنيف
 *
 *  صافي الربح    = هامش إجمالي - مصاريف تشغيلية
 *
 *  التدفق النقدي = رصيد أول الشهر + إيرادات - مشتريات - مصاريف
 */

import { query } from '../database/pool.ts';
import { getOpeningBalanceForDate } from './openingBalanceService.ts';
import { appCache } from '../utils/cache.ts';
import { roundMoney } from '../utils/money.ts';

const toNum = (v) => Number(v || 0);

/**
 * getProfitAndLoss
 * @param {string} fromDate  YYYY-MM-DD
 * @param {string} toDate    YYYY-MM-DD
 */
/**
 * تقرير الأرباح والخسائر (P&L) لفترة.
 * @param {string} fromDate تاريخ البداية
 * @param {string} toDate تاريخ النهاية
 * @returns {Promise<any>}
 */
export const getProfitAndLoss = async (fromDate: string, toDate: string) => {
  const cacheKey = `pl_${fromDate}_${toDate}`;
  const cachedVal = appCache.get(cacheKey);
  if (cachedVal) return cachedVal;

  const [
    salesData,
    cogsFromItems,
    purchasesData,
    expensesData,
    expensesByCategory,
    salesByType,
    returnsData,
  ] = await Promise.all([
    // ── 1. إجمالي الإيرادات ──
    query(
      `SELECT
         COALESCE(SUM(total_amount), 0)  AS revenue,
         COALESCE(SUM(cost_amount),  0)  AS cogs_stored,
         COALESCE(SUM(profit_amount),0)  AS gross_profit_stored,
         COALESCE(SUM(discount_amount),0) AS discounts,
         COUNT(*)::int                   AS sales_count
       FROM sales
       WHERE deleted_at IS NULL
         AND status = 'completed'
         AND sale_date BETWEEN $1::date AND $2::date`,
      [fromDate, toDate],
    ),

    // ── 2. تكلفة البضاعة من sale_items (للمبيعات POS التي تحتوي items) ──
    query(
      `SELECT COALESCE(SUM(si.cost_price * si.quantity), 0) AS cogs_items
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
       WHERE s.deleted_at IS NULL
         AND s.status = 'completed'
         AND s.sale_date BETWEEN $1::date AND $2::date`,
      [fromDate, toDate],
    ),

    // ── 3. إجمالي المشتريات في الفترة ──
    query(
      `SELECT
         COALESCE(SUM(total_amount), 0) AS purchases_total,
         COUNT(*)::int                  AS purchases_count
       FROM purchase_invoices
       WHERE deleted_at IS NULL
         AND invoice_date BETWEEN $1::date AND $2::date`,
      [fromDate, toDate],
    ),

    // ── 4. إجمالي المصاريف (مواصفة المصاريف الثابتة والمتغيرة) ──
    query(
      `SELECT
         COALESCE(SUM(e.amount), 0) AS expenses_total,
         COALESCE(SUM(CASE WHEN COALESCE(e.is_fixed, ec.is_fixed, FALSE) = TRUE THEN e.amount ELSE 0 END), 0) AS fixed_expenses_total,
         COALESCE(SUM(CASE WHEN COALESCE(e.is_fixed, ec.is_fixed, FALSE) = FALSE THEN e.amount ELSE 0 END), 0) AS variable_expenses_total,
         COUNT(e.id)::int AS expenses_count
       FROM expenses e
       LEFT JOIN expense_categories ec ON ec.id = e.category_id
       WHERE e.deleted_at IS NULL
         AND e.expense_date BETWEEN $1::date AND $2::date`,
      [fromDate, toDate],
    ),

    // ── 5. المصاريف مُجمَّعة بالتصنيف ودرجة الثبات ──
    query(
      `SELECT
         COALESCE(ec.name_ar, 'أخرى') AS category,
         COALESCE(e.is_fixed, ec.is_fixed, FALSE) AS is_fixed,
         COALESCE(SUM(e.amount), 0)   AS total,
         COUNT(e.id)::int             AS count
       FROM expenses e
       LEFT JOIN expense_categories ec ON ec.id = e.category_id
       WHERE e.deleted_at IS NULL
         AND e.expense_date BETWEEN $1::date AND $2::date
       GROUP BY ec.id, ec.name_ar, COALESCE(e.is_fixed, ec.is_fixed, FALSE)
       ORDER BY total DESC`,
      [fromDate, toDate],
    ),

    // ── 6. المبيعات مُجمَّعة بالنوع ──
    query(
      `SELECT
         sale_type,
         COALESCE(SUM(total_amount), 0)  AS revenue,
         COALESCE(SUM(cost_amount),  0)  AS cogs,
         COALESCE(SUM(profit_amount),0)  AS gross_profit,
         COUNT(*)::int                   AS count
       FROM sales
       WHERE deleted_at IS NULL
         AND status = 'completed'
         AND sale_date BETWEEN $1::date AND $2::date
       GROUP BY sale_type`,
      [fromDate, toDate],
    ),

    // ── 7. المرتجعات في الفترة ──
    query(
      `SELECT COALESCE(SUM(total_amount), 0) AS returns_total, COUNT(*)::int AS returns_count
       FROM sales
       WHERE deleted_at IS NULL
         AND status = 'returned'
         AND sale_date BETWEEN $1::date AND $2::date`,
      [fromDate, toDate],
    ),
  ]);

  // ── حساب رصيد أول المدة بخوارزمية ذكية ──
  // الخوارزمية:
  // 1. نبحث عن opening balance لنفس الشهر أو أقرب شهر سابق
  // 2. لو مش موجود، نرجع صفر
  const fromDateObj = new Date(fromDate + 'T00:00:00');
  const openingRow = await getOpeningBalanceForDate(fromDateObj);
  let openingBalance = toNum(openingRow.amount);

  // لو رجع صفر، حاول تبحث في الشهر نفسه بكل الـ keys الممكنة
  if (openingBalance === 0) {
    const yr = fromDateObj.getFullYear();
    const mo = String(fromDateObj.getMonth() + 1).padStart(2, '0');
    const altRow = await query(
      `SELECT value FROM settings
       WHERE key LIKE $1
       ORDER BY updated_at DESC
       LIMIT 1`,
      [`sales_opening_balance:${yr}-${mo}%`],
    );
    if (altRow.rows[0]?.value) {
      openingBalance = toNum(altRow.rows[0].value?.amount || 0);
    }
  }

  // ── بناء القيم ──
  const revenue = roundMoney(toNum(salesData.rows[0]?.revenue));
  const cogsFromItems_ = roundMoney(toNum(cogsFromItems.rows[0]?.cogs_items));
  const cogsStored = roundMoney(toNum(salesData.rows[0]?.cogs_stored));
  const purchases = roundMoney(toNum(purchasesData.rows[0]?.purchases_total));
  const expensesTotal = roundMoney(toNum(expensesData.rows[0]?.expenses_total));
  const fixedExpenses = roundMoney(toNum(expensesData.rows[0]?.fixed_expenses_total));
  const variableExpenses = roundMoney(toNum(expensesData.rows[0]?.variable_expenses_total));
  const returns = roundMoney(toNum(returnsData.rows[0]?.returns_total));

  // BUG-12 FIX: خوارزمية تحديد COGS الموثوقة
  let cogsUsed;
  let cogsBasis;

  if (cogsStored > 0) {
    cogsUsed = cogsStored;
    cogsBasis = 'cost_stored';
  } else if (cogsFromItems_ > 0) {
    cogsUsed = cogsFromItems_;
    cogsBasis = 'sale_items';
  } else {
    cogsUsed = purchases;
    cogsBasis = 'purchases';
  }

  const netRevenue = revenue; // المبيعات المكتملة هي صافي الإيرادات
  const grossRevenue = roundMoney(revenue + returns); // المبيعات الإجمالية
  const grossProfit = roundMoney(netRevenue - cogsUsed);
  const grossProfitMargin = netRevenue > 0 ? roundMoney((grossProfit / netRevenue) * 100) : 0;
  const netProfit = roundMoney(grossProfit - expensesTotal);
  const netProfitMargin = netRevenue > 0 ? roundMoney((netProfit / netRevenue) * 100) : 0;
  const breakEvenRevenue =
    grossProfitMargin > 0 ? roundMoney(fixedExpenses / (grossProfitMargin / 100)) : 0;

  /**
   * التدفق النقدي:
   * رصيد أول المدة + إيرادات - مشتريات فعلية - مصاريف
   * (هنا نستخدم المشتريات دائماً لأنها الفلوس اللي خرجت فعلاً)
   */
  const cashFlow = roundMoney(openingBalance + revenue - purchases - expensesTotal);
  const cashFlowBefore = openingBalance;
  const cashOut = roundMoney(purchases + expensesTotal);

  // ── تفاصيل المبيعات بالنوع ──
  const byType = {};
  for (const row of salesByType.rows) {
    byType[row.sale_type] = {
      revenue: roundMoney(toNum(row.revenue)),
      cogs: roundMoney(toNum(row.cogs)),
      gross_profit: roundMoney(toNum(row.gross_profit)),
      count: row.count,
    };
  }

  const result = {
    period: { from: fromDate, to: toDate },
    cogs_basis: cogsBasis,
    opening_balance: openingBalance, // رصيد أول المدة للشفافية

    // ── قسم الإيرادات ──
    revenue: {
      gross: grossRevenue,
      returns: returns,
      net: netRevenue,
      count: toNum(salesData.rows[0]?.sales_count) + toNum(returnsData.rows[0]?.returns_count),
      discounts: roundMoney(toNum(salesData.rows[0]?.discounts)),
      by_type: byType,
    },

    // ── قسم التكلفة ──
    cogs: {
      total: cogsUsed,
      from_items: cogsFromItems_,
      from_stored: cogsStored,
      from_purchases: purchases,
    },

    // ── هامش الربح الإجمالي ──
    gross_profit: {
      amount: grossProfit,
      margin: grossProfitMargin,
    },

    // ── المصاريف التشغيلية (ثابتة ومتغيرة) ──
    operating_expenses: {
      total: expensesTotal,
      fixed_total: fixedExpenses,
      variable_total: variableExpenses,
      break_even_revenue: breakEvenRevenue,
      count: toNum(expensesData.rows[0]?.expenses_count),
      breakdown: expensesByCategory.rows.map((r) => ({
        category: r.category,
        is_fixed: Boolean(r.is_fixed),
        total: roundMoney(toNum(r.total)),
        count: r.count,
      })),
    },

    // ── صافي الربح ──
    net_profit: {
      amount: netProfit,
      margin: netProfitMargin,
    },

    // ── المشتريات ──
    purchases: {
      total: purchases,
      count: toNum(purchasesData.rows[0]?.purchases_count),
    },

    // ── التدفق النقدي ──
    cash_flow: {
      opening: cashFlowBefore,
      revenue: revenue,
      cash_out: cashOut,
      closing: cashFlow,
      purchases: purchases,
      expenses: expensesTotal,
    },
  };

  appCache.set(cacheKey, result, 15 * 60 * 1000, ['pl_report']);
  return result;
};

/**
 * getMonthlyPLSummary — ملخص شهري لآخر N شهور للرسم البياني
 */
/**
 * ملخص شهري للأرباح والخسائر لآخر أشهر.
 * @param {number} [months] عدد الأشهر
 * @returns {Promise<any[]>}
 */
export const getMonthlyPLSummary = async (months: number = 6) => {
  const rows = await query(
    `SELECT
       date_trunc('month', s.sale_date)::date AS month,
       COALESCE(SUM(s.total_amount), 0)       AS revenue,
       COALESCE(SUM(s.cost_amount),  0)       AS cogs_stored
     FROM sales s
     WHERE s.deleted_at IS NULL AND s.status = 'completed'
     GROUP BY 1
     ORDER BY 1 DESC
     LIMIT $1`,
    [months],
  );

  const purchasesRows = await query(
    `SELECT
       date_trunc('month', invoice_date)::date AS month,
       COALESCE(SUM(total_amount), 0)          AS purchases
     FROM purchase_invoices
     WHERE deleted_at IS NULL
     GROUP BY 1
     ORDER BY 1 DESC
     LIMIT $1`,
    [months],
  );

  const expensesRows = await query(
    `SELECT
       date_trunc('month', expense_date)::date AS month,
       COALESCE(SUM(amount), 0)                AS expenses
     FROM expenses
     WHERE deleted_at IS NULL
     GROUP BY 1
     ORDER BY 1 DESC
     LIMIT $1`,
    [months],
  );

  const purchasesMap = new Map(
    purchasesRows.rows.map((r) => [String(r.month), toNum(r.purchases)]),
  );
  const expensesMap = new Map(expensesRows.rows.map((r) => [String(r.month), toNum(r.expenses)]));

  return rows.rows
    .map((r) => {
      const month = String(r.month);
      const revenue = toNum(r.revenue);
      const cogs = toNum(r.cogs_stored) || purchasesMap.get(month) || 0;
      const expenses = expensesMap.get(month) || 0;
      const gross = roundMoney(revenue - cogs);
      const net = roundMoney(gross - expenses);
      return {
        month,
        revenue: roundMoney(revenue),
        cogs: roundMoney(cogs),
        expenses: roundMoney(expenses),
        gross_profit: gross,
        net_profit: net,
        net_margin: revenue > 0 ? roundMoney((net / revenue) * 100) : 0,
      };
    })
    .reverse(); // من الأقدم للأحدث للرسم البياني
};
