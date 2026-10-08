import { parseBankStatementRows } from '../utils/bankStatementImport.ts';
import {
  lockMatchingAccount,
  journalSources,
  paymentSources,
  movementCents,
  validateBankSource,
} from './bankMatchingSources.ts';
import { effectivePostedJournalSql } from '../utils/journalPosting.ts';
/**
 * bankReconciliationService.ts — خدمة مطابقة وتسوية الحسابات البنكية والخزينة
 * ═══════════════════════════════════════════════════════════════════════════
 * يتيح مطابقة كشوف الحسابات البنكية والخزينة مع رصيد دفتر الأستاذ العام (GL)
 * واستيراد كشوف الحسابات البنكية (CSV / Excel) مع محرك مطابقة آلي ذكي
 * وإمكانية المطابقة اليدوية وإغلاق الجلسة باعتماد صارم (Difference = 0).
 */

import XLSX from 'xlsx';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { query, getClient } from '../database/pool.ts';
import { AppError } from '../types/errors.ts';
import { roundMoney } from '../utils/money.ts';
import { readSafeWorkbook } from './excelSecurity.ts';
import { reportCalendarDate } from '../utils/reportDates.ts';

const reconciliationInput = z
  .object({
    account_id: z.number().int().positive().max(2147483647),
    statement_date: reportCalendarDate,
    statement_balance: z.number().finite().gt(-1e13).lt(1e13),
    notes: z.string().optional(),
    status: z.enum(['draft', 'completed', 'cancelled']).optional(),
  })
  .strict();

const matchInput = z
  .object({
    journal_entry_id: z.number().int().positive().max(2147483647).optional(),
    payment_id: z.number().int().positive().max(2147483647).optional(),
    notes: z.string().optional(),
  })
  .strict()
  .refine((data) => Boolean(data.journal_entry_id) !== Boolean(data.payment_id));

interface LockedReconciliation {
  id: number;
  account_id: number;
  statement_date: string;
  statement_balance: string | number;
  status: string;
}
function normalizedStatement(row: BankStatementTransaction): BankStatementTransaction {
  return {
    ...row,
    debit: roundMoney(Number(row.debit)),
    credit: roundMoney(Number(row.credit)),
    amount: roundMoney(Number(row.amount)),
    matched_amount: roundMoney(Number(row.matched_amount)),
  };
}

async function lockDraftReconciliation(client: PoolClient, id: number) {
  const result = await client.query<LockedReconciliation>(
    'SELECT * FROM bank_reconciliations WHERE id=$1 FOR UPDATE',
    [id],
  );
  const rec = result.rows[0];
  if (!rec) throw new AppError('جلسة المطابقة غير موجودة', 404);
  if (rec.status !== 'draft') throw new AppError('لا يمكن تعديل جلسة مطابقة مكتملة أو ملغاة', 400);
  return rec;
}

/** Always lock the session before its movements, matching import/close lock order. */
async function editStatementTransaction<T>(
  id: number,
  work: (client: PoolClient, tx: BankStatementTransaction, rec: LockedReconciliation) => Promise<T>,
) {
  const parent = await query(
    'SELECT reconciliation_id FROM bank_statement_transactions WHERE id=$1',
    [id],
  );
  if (!parent.rows[0]) throw new AppError('حركة كشف الحساب غير موجودة', 404);
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const rec = await lockDraftReconciliation(client, parent.rows[0].reconciliation_id);
    const result = await client.query<BankStatementTransaction>(
      'SELECT * FROM bank_statement_transactions WHERE id=$1 AND reconciliation_id=$2 FOR UPDATE',
      [id, rec.id],
    );
    if (!result.rows[0]) throw new AppError('حركة كشف الحساب غير موجودة', 404);
    const value = await work(client, result.rows[0], rec);
    await client.query('COMMIT');
    return value;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export interface CreateReconciliationInput {
  account_id: number;
  statement_date: string;
  statement_balance: number;
  notes?: string;
  status?: 'draft' | 'completed' | 'cancelled';
}

export interface BankStatementTransaction {
  id: number;
  reconciliation_id: number;
  transaction_date: string;
  description: string;
  reference?: string | null;
  debit: number;
  credit: number;
  amount: number;
  status: 'unmatched' | 'matched' | 'partial' | 'excluded' | 'duplicate';
  matched_journal_entry_id?: number | null;
  matched_payment_id?: number | null;
  matched_amount: number;
  notes?: string | null;
  created_at: string;
}

export const bankReconciliationService = {
  /**
   * جلب قائمة جلسات المطابقة مع فلترة اختيارية
   */
  async getReconciliations(
    filters: { account_id?: number; from_date?: string; to_date?: string; status?: string } = {},
  ) {
    let sql = `
      SELECT
        br.*,
        a.code AS account_code,
        a.name_ar AS account_name,
        u.full_name AS reconciled_by_name,
        COALESCE((
          SELECT COUNT(*)::int
          FROM bank_statement_transactions bst
          WHERE bst.reconciliation_id = br.id
        ), 0) AS total_transactions_count,
        COALESCE((
          SELECT COUNT(*)::int
          FROM bank_statement_transactions bst
          WHERE bst.reconciliation_id = br.id AND bst.status = 'matched'
        ), 0) AS matched_transactions_count
      FROM bank_reconciliations br
      JOIN accounts a ON a.id = br.account_id
      LEFT JOIN users u ON u.id = br.reconciled_by
      WHERE 1=1
    `;
    const params: any[] = [];

    if (filters.account_id) {
      params.push(filters.account_id);
      sql += ` AND br.account_id = $${params.length}`;
    }
    if (filters.from_date) {
      params.push(filters.from_date);
      sql += ` AND br.statement_date >= $${params.length}::date`;
    }
    if (filters.to_date) {
      params.push(filters.to_date);
      sql += ` AND br.statement_date <= $${params.length}::date`;
    }
    if (filters.status) {
      params.push(filters.status);
      sql += ` AND br.status = $${params.length}`;
    }

    sql += ` ORDER BY br.statement_date DESC, br.id DESC`;
    const res = await query(sql, params);
    return res.rows.map((r: any) => ({
      ...r,
      statement_balance: roundMoney(Number(r.statement_balance)),
      ledger_balance: roundMoney(Number(r.ledger_balance)),
      reconciled_balance: roundMoney(Number(r.reconciled_balance)),
      difference: roundMoney(Number(r.difference)),
      total_transactions_count: Number(r.total_transactions_count || 0),
      matched_transactions_count: Number(r.matched_transactions_count || 0),
    }));
  },

  /**
   * جلب جلسة مطابقة بواسطة المعرف
   */
  async getReconciliationById(id: number) {
    const sql = `
      SELECT
        br.*,
        a.code AS account_code,
        a.name_ar AS account_name,
        u.full_name AS reconciled_by_name,
        COALESCE((
          SELECT COUNT(*)::int
          FROM bank_statement_transactions bst
          WHERE bst.reconciliation_id = br.id
        ), 0) AS total_transactions_count,
        COALESCE((
          SELECT COUNT(*)::int
          FROM bank_statement_transactions bst
          WHERE bst.reconciliation_id = br.id AND bst.status = 'matched'
        ), 0) AS matched_transactions_count
      FROM bank_reconciliations br
      JOIN accounts a ON a.id = br.account_id
      LEFT JOIN users u ON u.id = br.reconciled_by
      WHERE br.id = $1
    `;
    const res = await query(sql, [id]);
    if (!res.rows[0]) {
      throw new AppError('جلسة المطابقة غير موجودة', 404);
    }
    const r = res.rows[0];
    return {
      ...r,
      statement_balance: roundMoney(Number(r.statement_balance)),
      ledger_balance: roundMoney(Number(r.ledger_balance)),
      reconciled_balance: roundMoney(Number(r.reconciled_balance)),
      difference: roundMoney(Number(r.difference)),
      total_transactions_count: Number(r.total_transactions_count || 0),
      matched_transactions_count: Number(r.matched_transactions_count || 0),
    };
  },

  /**
   * حساب رصيد دفتر الأستاذ لحساب معين حتى تاريخ محدد
   * تم تحصينه لمنع تسرب أي قيود مسودة أو قيود مستقبلية نهائياً
   */
  async getLedgerBalanceAsOfDate(
    accountId: number,
    asOfDate: string,
    db: typeof query = query,
  ): Promise<number> {
    const sql = `
      SELECT
        COALESCE(
          SUM(
            CASE
              WHEN a.normal_balance = 'debit' THEN (jel.debit - jel.credit)
              ELSE (jel.credit - jel.debit)
            END
          ), 0
        ) AS ledger_balance
      FROM accounts a
      LEFT JOIN (
        journal_entry_lines jel
        JOIN journal_entries je
          ON je.id = jel.journal_entry_id
         AND ${effectivePostedJournalSql('je')}
         AND je.entry_date <= $2::date
      ) ON jel.account_id = a.id
      WHERE a.id = $1
      GROUP BY a.id, a.normal_balance
    `;
    const res = await db(sql, [accountId, asOfDate]);
    if (res.rows.length === 0) {
      throw new AppError('الحساب المحاسبي غير موجود', 404);
    }
    const balance = Number(res.rows[0].ledger_balance);
    if (!Number.isFinite(balance)) throw new AppError('رصيد دفتر الأستاذ غير صالح للمطابقة', 409);
    return roundMoney(balance);
  },

  /**
   * إنشاء جلسة مطابقة وتسوية جديدة
   */
  async createReconciliation(userId: number, input: unknown) {
    const parsed = reconciliationInput.safeParse(input);
    if (!parsed.success) {
      throw new AppError(
        'بيانات جلسة المطابقة غير صالحة: تحقق من الحساب والتاريخ والرصيد',
        400,
        'VALIDATION_ERROR',
      );
    }
    const data = parsed.data;
    const statementBalance = roundMoney(data.statement_balance);
    if (Math.abs(statementBalance) >= 1e13) {
      throw new AppError('رصيد كشف الحساب يتجاوز الحد المسموح', 400, 'VALIDATION_ERROR');
    }
    const ledgerBalance = await this.getLedgerBalanceAsOfDate(data.account_id, data.statement_date);
    const difference = roundMoney(statementBalance - ledgerBalance);
    const reconciledBalance = statementBalance;
    const status = data.status || (Math.abs(difference) <= 0.01 ? 'completed' : 'draft');
    if (status === 'completed' && Math.abs(difference) > 0.01) {
      throw new AppError('لا يمكن إكمال المطابقة مع وجود فرق بين كشف الحساب ودفتر الأستاذ', 400);
    }

    const client = await getClient();
    try {
      await client.query('BEGIN');

      const seqRes = await client.query(`SELECT nextval('seq_bank_reconciliations_number') AS n`);
      const yy = new Date(data.statement_date).getFullYear() || new Date().getFullYear();
      const recNumber = `REC-${yy}-${String(seqRes.rows[0].n).padStart(5, '0')}`;

      const insertSql = `
        INSERT INTO bank_reconciliations (
          reconciliation_number,
          account_id,
          statement_date,
          statement_balance,
          ledger_balance,
          reconciled_balance,
          difference,
          status,
          notes,
          reconciled_by
        )
        VALUES ($1, $2, $3::date, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `;

      const insertRes = await client.query(insertSql, [
        recNumber,
        data.account_id,
        data.statement_date,
        statementBalance,
        ledgerBalance,
        reconciledBalance,
        difference,
        status,
        data.notes || null,
        userId,
      ]);

      await client.query('COMMIT');

      return {
        ...insertRes.rows[0],
        statement_balance: statementBalance,
        ledger_balance: ledgerBalance,
        reconciled_balance: reconciledBalance,
        difference,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  /**
   * استيراد حركات كشف الحساب البنكي من ملف CSV أو Excel
   */
  async importBankStatement(reconciliationId: number, fileBuffer: Buffer, filename: string) {
    const rec = await this.getReconciliationById(reconciliationId);
    if (rec.status !== 'draft') {
      throw new AppError('لا يمكن استيراد كشف حساب لجلسة مطابقة مكتملة ومغلقة', 400);
    }

    const workbook = readSafeWorkbook(fileBuffer, { raw: true, codepage: 65001 });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: '',
      raw: true,
      blankrows: true,
    });
    const parsedTransactions = parseBankStatementRows(
      rows,
      rec.statement_date,
      Boolean(workbook.Workbook?.WBProps?.date1904),
      filename,
    );

    const client = await getClient();
    try {
      await client.query('BEGIN');

      await lockDraftReconciliation(client, reconciliationId);
      for (const tx of parsedTransactions) {
        await client.query(
          `INSERT INTO bank_statement_transactions (
            reconciliation_id, transaction_date, description, reference, debit, credit, amount, status
          ) VALUES ($1, $2::date, $3, $4, $5, $6, $7, 'unmatched')`,
          [
            reconciliationId,
            tx.transaction_date,
            tx.description,
            tx.reference || null,
            tx.debit,
            tx.credit,
            tx.amount,
          ],
        );
      }

      const transactions = await this.getStatementTransactions(
        reconciliationId,
        {},
        (sql, params) => client.query(sql, params),
      );
      await client.query('COMMIT');

      return {
        reconciliation_id: reconciliationId,
        imported_count: parsedTransactions.length,
        transactions,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  /**
   * جلب حركات كشف الحساب البنكي لجلسة مطابقة
   */
  async getStatementTransactions(
    reconciliationId: number,
    filters: { status?: string } = {},
    db: typeof query = query,
  ): Promise<BankStatementTransaction[]> {
    let sql = `
      SELECT
        bst.*,
        je.entry_number AS matched_entry_number,
        je.entry_date AS matched_entry_date,
        je.description AS matched_entry_description,
        p.payment_number AS matched_payment_number
      FROM bank_statement_transactions bst
      LEFT JOIN journal_entries je ON je.id = bst.matched_journal_entry_id
      LEFT JOIN payments p ON p.id = bst.matched_payment_id
      WHERE bst.reconciliation_id = $1
    `;
    const params: any[] = [reconciliationId];

    if (filters.status) {
      params.push(filters.status);
      sql += ` AND bst.status = $${params.length}`;
    }

    sql += ` ORDER BY bst.transaction_date ASC, bst.id ASC`;
    const res = await db(sql, params);

    return res.rows.map((r: any) => ({
      ...r,
      debit: roundMoney(Number(r.debit)),
      credit: roundMoney(Number(r.credit)),
      amount: roundMoney(Number(r.amount)),
      matched_amount: roundMoney(Number(r.matched_amount)),
    }));
  },

  /**
   * محرك المطابقة الآلية الذكية (Smart Auto-Match Engine)
   * يطابق حركات كشف الحساب البنكي مع قيود اليومية أو المدفوعات غير المطابقة
   */
  async autoMatchTransactions(reconciliationId: number) {
    const client = await getClient();
    try {
      await client.query('BEGIN');
      const rec = await lockDraftReconciliation(client, reconciliationId);
      await lockMatchingAccount(client, rec.account_id);

      // 1. جلب حركات كشف الحساب غير المطابقة
      const unmatchedTxRes = await client.query(
        `SELECT * FROM bank_statement_transactions
         WHERE reconciliation_id = $1 AND status = 'unmatched'
         ORDER BY transaction_date ASC, id ASC
         FOR UPDATE`,
        [reconciliationId],
      );
      const unmatchedTxs = unmatchedTxRes.rows;

      if (unmatchedTxs.length === 0) {
        await client.query('COMMIT');
        return { matched_count: 0, message: 'لا توجد حركات غير مطابقة لمعالجتها' };
      }

      const sources = await journalSources(client, rec);
      const payments = await paymentSources(client, sources);
      const byJournal = new Map(sources.map((source) => [source.id, source]));
      let matchedCount = 0;
      for (const tx of unmatchedTxs) {
        let signedAmount: number;
        try {
          signedAmount = movementCents(tx, rec);
        } catch (error) {
          if (error instanceof AppError && error.statusCode === 400) continue;
          throw error;
        }
        const amount = Math.abs(signedAmount);
        const withinDate = (date: string) =>
          Math.abs(new Date(date).getTime() - new Date(tx.transaction_date).getTime()) <=
          5 * 86400000;
        const compatible = sources.filter(
          (source) =>
            Math.sign(source.movement) === Math.sign(signedAmount) &&
            source.remaining >= amount &&
            withinDate(source.entry_date),
        );
        const compatibleIds = new Set(compatible.map((source) => source.id));
        const availablePayments = payments.filter(
          (payment) => compatibleIds.has(payment.journalId) && payment.remaining >= amount,
        );
        const referenceSources = compatible.filter(
          (source) => tx.reference && tx.reference === source.entry_number,
        );
        const referencePayments = availablePayments.filter(
          (payment) => tx.reference && tx.reference === payment.payment_number,
        );
        const referenced = new Set([
          ...referenceSources.map((source) => source.id),
          ...referencePayments.map((payment) => payment.journalId),
        ]);
        const exactPayments = availablePayments.filter((payment) => payment.remaining === amount);
        const exactSources = compatible.filter((source) => source.remaining === amount);
        const candidates = referenced.size
          ? referenced
          : new Set([
              ...exactSources.map((source) => source.id),
              ...exactPayments.map((payment) => payment.journalId),
            ]);
        const chosen = candidates.size === 1 ? byJournal.get([...candidates][0]) : undefined;
        let paymentId: number | undefined;
        if (chosen) {
          const matchingPayments = (
            referencePayments.length ? referencePayments : exactPayments
          ).filter((payment) => payment.journalId === chosen.id);
          if (matchingPayments.length === 1) {
            paymentId = matchingPayments[0].id;
            matchingPayments[0].remaining -= amount;
          }
        }
        if (!chosen) continue;
        chosen.remaining -= amount;
        await client.query(
          `UPDATE bank_statement_transactions SET status='matched',
          matched_journal_entry_id=$1,matched_payment_id=$2,matched_amount=$3,
          notes=COALESCE(notes,'') || ' [مطابقة آلية مع قيد ' || $4 || ']'
          WHERE id=$5`,
          [chosen.id, paymentId ?? null, amount / 100, chosen.entry_number, tx.id],
        );
        matchedCount++;
      }
      const transactions = await this.getStatementTransactions(
        reconciliationId,
        {},
        (sql, params) => client.query(sql, params),
      );
      await client.query('COMMIT');

      return {
        reconciliation_id: reconciliationId,
        matched_count: matchedCount,
        remaining_unmatched: unmatchedTxs.length - matchedCount,
        transactions,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  /**
   * مطابقة يدوية لحركة كشف حساب مع قيد يومية أو دفعة
   */
  async matchTransaction(statementTxId: number, input: unknown) {
    const parsed = matchInput.safeParse(input);
    if (!parsed.success) {
      throw new AppError(
        'يجب تحديد قيد يومية أو دفعة واحدة صحيحة للمطابقة',
        400,
        'VALIDATION_ERROR',
      );
    }
    const matchData = parsed.data;

    return editStatementTransaction(statementTxId, async (client, tx, rec) => {
      const resolved = await validateBankSource(client, tx, rec, {
        journalId: matchData.journal_entry_id,
        paymentId: matchData.payment_id,
      });
      const res = await client.query(
        `UPDATE bank_statement_transactions
       SET status = 'matched',
           matched_journal_entry_id = $1,
           matched_payment_id = $2,
           matched_amount = $3,
           notes = COALESCE($4, notes)
       WHERE id = $5
       RETURNING *`,
        [
          resolved.journalId,
          resolved.paymentId ?? null,
          resolved.amount,
          matchData.notes || null,
          statementTxId,
        ],
      );

      return normalizedStatement(res.rows[0]);
    });
  },

  /**
   * إلغاء مطابقة حركة كشف حساب (Unmatch)
   */
  async unmatchTransaction(statementTxId: number) {
    return editStatementTransaction(statementTxId, async (client) => {
      const res = await client.query(
        `UPDATE bank_statement_transactions
       SET status = 'unmatched',
           matched_journal_entry_id = NULL,
           matched_payment_id = NULL,
           matched_amount = 0
       WHERE id = $1
       RETURNING *`,
        [statementTxId],
      );

      return normalizedStatement(res.rows[0]);
    });
  },

  /**
   * استبعاد حركة من المطابقة (Exclude)
   */
  async excludeTransaction(statementTxId: number, reason: string) {
    if (!reason || !reason.trim()) {
      throw new AppError('سبب الاستبعاد إلزامي', 400);
    }

    return editStatementTransaction(statementTxId, async (client) => {
      const res = await client.query(
        `UPDATE bank_statement_transactions
       SET status = 'excluded',
           matched_journal_entry_id = NULL,
           matched_payment_id = NULL,
           matched_amount = 0,
           notes = $1
       WHERE id = $2
       RETURNING *`,
        [reason.trim(), statementTxId],
      );

      return normalizedStatement(res.rows[0]);
    });
  },

  /**
   * اعتماد وإغلاق جلسة المطابقة الصارم (Difference = 0 Enforcement)
   */
  async finalizeReconciliation(reconciliationId: number, userId: number) {
    const client = await getClient();
    try {
      await client.query('BEGIN');
      const rec = await lockDraftReconciliation(client, reconciliationId);
      await lockMatchingAccount(client, rec.account_id);

      // التحقق من الحركات غير المطابقة
      const txStatsRes = await client.query(
        `SELECT
         COUNT(*) AS total_count,
         COUNT(CASE WHEN status IN ('unmatched', 'partial') THEN 1 END) AS unmatched_count
       FROM bank_statement_transactions
       WHERE reconciliation_id = $1`,
        [reconciliationId],
      );
      const { total_count, unmatched_count } = txStatsRes.rows[0];

      // إعادة حساب رصيد الأستاذ في تاريخ الكشف للتأكد من عدم تغيره
      const latestLedgerBalance = await this.getLedgerBalanceAsOfDate(
        rec.account_id,
        rec.statement_date,
        (sql, params) => client.query(sql, params),
      );
      const statementBalance = roundMoney(Number(rec.statement_balance));
      const difference = roundMoney(statementBalance - latestLedgerBalance);

      if (Math.abs(difference) > 0.01) {
        throw new AppError(
          `لا يمكن اعتماد جلسة المطابقة! يوجد فارق غير مسوى قدره (${difference} ج.م) بين رصيد الكشف (${statementBalance}) ورصيد الأستاذ (${latestLedgerBalance}). يجب تسوية جميع الفروقات ليصبح الفارق صفراً.`,
          400,
        );
      }

      if (Number(total_count) > 0 && Number(unmatched_count) > 0) {
        throw new AppError(
          `يوجد ${unmatched_count} حركة في كشف الحساب البنكي لم يتم مطابقتها أو استبعادها بعد.`,
          400,
        );
      }

      const matches = await client.query<BankStatementTransaction>(
        "SELECT * FROM bank_statement_transactions WHERE reconciliation_id=$1 AND status='matched' ORDER BY id",
        [reconciliationId],
      );
      for (const tx of matches.rows) {
        const resolved = await validateBankSource(
          client,
          tx,
          rec,
          tx.matched_payment_id
            ? { paymentId: tx.matched_payment_id }
            : { journalId: tx.matched_journal_entry_id || undefined },
        );
        if (tx.matched_journal_entry_id && tx.matched_journal_entry_id !== resolved.journalId)
          throw new AppError('مصدر الدفعة يختلف عن القيد المرتبط بالحركة', 409);
        if (roundMoney(Number(tx.matched_amount)) !== resolved.amount)
          throw new AppError('مبلغ المطابقة المحفوظ لا يساوي حركة الكشف', 409);
      }

      await client.query(
        `UPDATE bank_reconciliations
         SET status = 'completed',
             ledger_balance = $1,
             difference = $2,
             reconciled_balance = $3,
             reconciled_by = $4
         WHERE id = $5
         RETURNING *`,
        [latestLedgerBalance, difference, statementBalance, userId, reconciliationId],
      );

      await client.query('COMMIT');
      return this.getReconciliationById(reconciliationId);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },
};
