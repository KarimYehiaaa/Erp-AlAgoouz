/**
 * financialPeriodService.ts — خدمة إدارة وإقفال الفترات المحاسبية (Period Locking)
 * ════════════════════════════════════════════════════════════════════════════════
 * توفر:
 *  - استعراض وإنشاء الفترات المحاسبية (شهرية / سنوية)
 *  - قائمة فحص الجاهزية للإقفال (Checklist)
 *  - إقفال الفترة مع تفعيل الحماية الصارمة ضد تعديل أي سجلات مالية
 *  - إعادة فتح الفترة للمراجعة الاستثنائية مع توثيق السبب
 */

import { query, withTransaction } from '../database/pool.ts';
import { AppError } from '../types/errors.ts';
import { isCalendarDate } from '../utils/localDate.ts';

export interface CreatePeriodInput {
  period_start?: string;
  period_end?: string;
  start_date?: string;
  end_date?: string;
  period_name?: string;
  period_code?: string;
  fiscal_year?: number;
  notes?: string;
}

export const financialPeriodService = {
  /**
   * جلب قائمة الفترات المحاسبية
   */
  async listPeriods(filters: { status?: string } = {}) {
    let sql = `
      SELECT 
        fp.*,
        u.full_name AS closed_by_name
      FROM financial_periods fp
      LEFT JOIN users u ON u.id = fp.closed_by
      WHERE 1=1
    `;
    const params: any[] = [];

    if (filters.status) {
      params.push(filters.status);
      sql += ` AND fp.status = $${params.length}`;
    }

    sql += ` ORDER BY fp.period_start DESC`;
    const res = await query(sql, params);
    return res.rows;
  },

  /**
   * جلب فترة محاسبية بالمعرف
   */
  async getPeriodById(id: number, db: typeof query = query) {
    const res = await db(
      `SELECT 
         fp.*,
         u.full_name AS closed_by_name
       FROM financial_periods fp
       LEFT JOIN users u ON u.id = fp.closed_by
       WHERE fp.id = $1`,
      [id],
    );
    if (!res.rows[0]) {
      throw new AppError('الفترة المحاسبية غير موجودة', 404);
    }
    return res.rows[0];
  },

  /**
   * إنشاء فترة محاسبية جديدة
   */
  async createPeriod(userId: number, data: CreatePeriodInput) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new AppError('بيانات الفترة المحاسبية غير صحيحة', 400);
    }
    const pStart = data.period_start || data.start_date;
    const pEnd = data.period_end || data.end_date;
    if (!pStart || !pEnd) {
      throw new AppError('تاريخ بداية ونهاية الفترة مطلوبان', 400);
    }
    if (
      !isCalendarDate(pStart) ||
      !isCalendarDate(pEnd) ||
      pStart.startsWith('0000-') ||
      pEnd.startsWith('0000-')
    ) {
      throw new AppError('تاريخ الفترة يجب أن يكون تاريخًا صحيحًا بصيغة YYYY-MM-DD', 400);
    }
    if (pEnd < pStart) {
      throw new AppError('تاريخ نهاية الفترة يجب أن يكون لاحقاً لتاريخ بدايتها', 400);
    }

    return withTransaction(async (client) => {
      // An empty overlap query cannot lock a missing row. Serialize inserts before checking.
      await client.query('LOCK TABLE financial_periods IN SHARE ROW EXCLUSIVE MODE');
      const overlapRes = await client.query(
        `SELECT id FROM financial_periods
       WHERE (period_start <= $2::date AND period_end >= $1::date)
       LIMIT 1`,
        [pStart, pEnd],
      );
      if (overlapRes.rows[0]) {
        throw new AppError('يوجد تداخل مع فترة محاسبية أخرى مسجلة مسبقاً', 400);
      }

      const noteText = [data.period_name, data.notes].filter(Boolean).join(' - ') || null;

      const res = await client.query(
        `INSERT INTO financial_periods (period_start, period_end, status, notes)
       VALUES ($1::date, $2::date, 'open', $3)
       RETURNING *`,
        [pStart, pEnd, noteText],
      );

      return res.rows[0];
    });
  },

  /**
   * فحص جاهزية الإقفال (Period Close Checklist)
   */
  async getCloseChecklist(periodId: number, db: typeof query = query) {
    const period = await this.getPeriodById(periodId, db);

    // 1. فحص قيود اليومية غير المرحلة (Drafts)
    const draftsRes = await db(
      `SELECT COUNT(*)::int AS count 
       FROM journal_entries 
       WHERE status = 'draft' 
         AND entry_date BETWEEN $1::date AND $2::date`,
      [period.period_start, period.period_end],
    );
    const draftEntriesCount = Number(draftsRes.rows[0]?.count || 0);

    // 2. فحص ورديات الكاشير المفتوحة (Open POS shifts)
    const shiftsRes = await db(
      `SELECT COUNT(*)::int AS count 
       FROM pos_shifts 
       WHERE status = 'open' 
         AND (opened_at AT TIME ZONE 'Africa/Cairo')::date BETWEEN $1::date AND $2::date`,
      [period.period_start, period.period_end],
    );
    const openShiftsCount = Number(shiftsRes.rows[0]?.count || 0);

    // 3. فحص جلسات مطابقة البنك المعلقة أو ذات الفروقات
    const recsRes = await db(
      `SELECT COUNT(*)::int AS count 
       FROM bank_reconciliations 
       WHERE statement_date BETWEEN $1::date AND $2::date 
         AND (status != 'completed' OR ABS(difference) > 0.01)`,
      [period.period_start, period.period_end],
    );
    const pendingReconciliationsCount = Number(recsRes.rows[0]?.count || 0);
    const balancesRes = await db(
      `SELECT COUNT(*)::int AS count FROM (
         SELECT je.id FROM journal_entries je
         LEFT JOIN journal_entry_lines line ON line.journal_entry_id = je.id
         WHERE je.entry_date BETWEEN $1::date AND $2::date
           AND je.status IN ('draft', 'posted')
         GROUP BY je.id
         HAVING COUNT(line.id) = 0 OR
           ABS(COALESCE(SUM(line.debit), 0) - COALESCE(SUM(line.credit), 0)) > 0.01
       ) invalid_entries`,
      [period.period_start, period.period_end],
    );
    const unbalancedEntriesCount = Number(balancesRes.rows[0]?.count || 0);
    const { accountingService } = await import('./accountingService.ts');
    const aging = await accountingService.reconcileAgingWithLedger(period.period_end, db);

    const isReady =
      draftEntriesCount === 0 &&
      openShiftsCount === 0 &&
      pendingReconciliationsCount === 0 &&
      unbalancedEntriesCount === 0 &&
      aging.is_fully_reconciled;

    const blockers: string[] = [];
    if (draftEntriesCount > 0)
      blockers.push(`يوجد ${draftEntriesCount} قيود يومية مسودة غير مرحلة`);
    if (openShiftsCount > 0) blockers.push(`يوجد ${openShiftsCount} ورديات كاشير مفتوحة`);
    if (pendingReconciliationsCount > 0)
      blockers.push(`يوجد ${pendingReconciliationsCount} مطابقات بنكية معلقة`);
    if (unbalancedEntriesCount > 0)
      blockers.push(`يوجد ${unbalancedEntriesCount} قيود غير متوازنة أو بلا بنود`);
    if (!aging.is_fully_reconciled)
      blockers.push('توجد فروق بين مديونيات العملاء/الموردين والأستاذ العام');

    const checks = {
      draft_journal_entries: {
        count: draftEntriesCount,
        passed: draftEntriesCount === 0,
        label: 'لا توجد قيود يومية مسودة غير مرحلة',
      },
      unbalanced_journal_entries: {
        count: unbalancedEntriesCount,
        passed: unbalancedEntriesCount === 0,
        label: 'لا توجد قيود يومية غير متوازنة',
      },
      open_pos_shifts: {
        count: openShiftsCount,
        passed: openShiftsCount === 0,
        label: 'جميع ورديات الكاشير مغلقة ومطابقة (Z-Reports)',
      },
      pending_bank_reconciliations: {
        count: pendingReconciliationsCount,
        passed: pendingReconciliationsCount === 0,
        label: 'مطابقات البنك والخزينة مكتملة وبلا فروقات',
      },
      unreconciled_bank_sessions: {
        count: pendingReconciliationsCount,
        passed: pendingReconciliationsCount === 0,
        label: 'مطابقات البنك والخزينة مكتملة وبلا فروقات',
      },
      aging_ledger_discrepancies: {
        count: Number(!aging.customers.is_reconciled) + Number(!aging.suppliers.is_reconciled),
        passed: aging.is_fully_reconciled,
        customer_variance: aging.customers.variance,
        supplier_variance: aging.suppliers.variance,
        label: 'مطابقة أرصدة أعمار الديون مع الأستاذ العام',
      },
    };

    return {
      period_id: periodId,
      period: {
        start: period.period_start,
        end: period.period_end,
        status: period.status,
      },
      checklist: checks,
      checks,
      blockers,
      is_ready_to_close: isReady,
    };
  },

  /**
   * إقفال الفترة المحاسبية
   */
  async closePeriod(id: number, userId: number, options: { force?: boolean; notes?: string } = {}) {
    if (
      !options ||
      typeof options !== 'object' ||
      Array.isArray(options) ||
      (options.force !== undefined && typeof options.force !== 'boolean') ||
      (options.notes !== undefined && typeof options.notes !== 'string')
    ) {
      throw new AppError(
        'بيانات الإقفال غير صحيحة؛ خيار الإقفال الإجباري يجب أن يكون true أو false',
        400,
      );
    }
    if (options.force === true && !options.notes?.trim()) {
      throw new AppError('سبب الإقفال الإجباري إلزامي لتوثيق تجاوز قائمة الجاهزية', 400);
    }
    return withTransaction(async (client) => {
      const db: typeof query = (text, params) => client.query(text, params);
      const locked = await db('SELECT * FROM financial_periods WHERE id = $1 FOR UPDATE', [id]);
      const period = locked.rows[0];
      if (!period) throw new AppError('الفترة المحاسبية غير موجودة', 404);
      if (period.status === 'closed' || period.status === 'locked') {
        throw new AppError('الفترة المحاسبية مغلقة بالفعل', 400);
      }

      if (options.force !== true) {
        const checklist = await this.getCloseChecklist(id, db);
        if (!checklist.is_ready_to_close) {
          throw new AppError(
            `لا يمكن إقفال الفترة قبل استيفاء قائمة الفحص: ${checklist.blockers.join('، ')}.`,
            400,
          );
        }
      }

      const noteAppend = options.notes
        ? (period.notes ? period.notes + ' | ' : '') + `إقفال: ${options.notes}`
        : period.notes;

      const res = await db(
        `UPDATE financial_periods
       SET status = 'closed',
           closed_by = $1,
           closed_at = NOW(),
           notes = $2,
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
        [userId, noteAppend, id],
      );

      return res.rows[0];
    });
  },

  /**
   * إعادة فتح فترة محاسبية مغلقة للمراجعة
   */
  async reopenPeriod(id: number, userId: number, reason: string) {
    if (typeof reason !== 'string' || !reason.trim()) {
      throw new AppError('سبب إعادة فتح الفترة المحاسبية إلزامي لتوثيق مسار التدقيق', 400);
    }

    return withTransaction(async (client) => {
      await client.query('SELECT id FROM financial_periods WHERE id = $1 FOR UPDATE', [id]);
      const db: typeof query = (sql, params) => client.query(sql, params);
      const period = await this.getPeriodById(id, db);
      if (period.status === 'open') {
        throw new AppError('الفترة المحاسبية مفتوحة بالفعل', 400);
      }

      const noteAppend =
        (period.notes ? period.notes + ' | ' : '') +
        `إعادة فتح بواسطة مستخدم #${userId}: ${reason.trim()}`;

      const res = await db(
        `UPDATE financial_periods
       SET status = 'open',
           closed_by = NULL,
           closed_at = NULL,
           notes = $1,
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
        [noteAppend, id],
      );

      return res.rows[0];
    });
  },
};
