/**
 * bankReconciliationService.ts — خدمة مطابقة وتسوية الحسابات البنكية والخزينة
 * ═══════════════════════════════════════════════════════════════════════════
 * يتيح مطابقة كشوف الحسابات البنكية والخزينة مع رصيد دفتر الأستاذ العام (GL)
 * واستيراد كشوف الحسابات البنكية (CSV / Excel) مع محرك مطابقة آلي ذكي
 * وإمكانية المطابقة اليدوية وإغلاق الجلسة باعتماد صارم (Difference = 0).
 */

import XLSX from 'xlsx';
import { query, getClient } from '../database/pool.ts';
import { AppError } from '../types/errors.ts';
import { roundMoney } from '../utils/money.ts';
import { readSafeWorkbook } from './excelSecurity.ts';

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
  reference?: string;
  debit: number;
  credit: number;
  amount: number;
  status: 'unmatched' | 'matched' | 'partial' | 'excluded' | 'duplicate';
  matched_journal_entry_id?: number;
  matched_payment_id?: number;
  matched_amount: number;
  notes?: string;
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
  async getLedgerBalanceAsOfDate(accountId: number, asOfDate: string): Promise<number> {
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
         AND je.status = 'posted' 
         AND je.entry_date <= $2::date
      ) ON jel.account_id = a.id
      WHERE a.id = $1
      GROUP BY a.id, a.normal_balance
    `;
    const res = await query(sql, [accountId, asOfDate]);
    if (res.rows.length === 0) {
      throw new AppError('الحساب المحاسبي غير موجود', 404);
    }
    return roundMoney(Number(res.rows[0].ledger_balance));
  },

  /**
   * إنشاء جلسة مطابقة وتسوية جديدة
   */
  async createReconciliation(userId: number, data: CreateReconciliationInput) {
    if (!data.account_id) {
      throw new AppError('الحساب المحاسبي مطلوب للمطابقة', 400);
    }
    if (!data.statement_date) {
      throw new AppError('تاريخ كشف الحساب مطلوب', 400);
    }

    const statementBalance = roundMoney(Number(data.statement_balance ?? 0));
    const ledgerBalance = await this.getLedgerBalanceAsOfDate(data.account_id, data.statement_date);
    const difference = roundMoney(statementBalance - ledgerBalance);
    const reconciledBalance = statementBalance;
    const status = data.status || (Math.abs(difference) <= 0.01 ? 'completed' : 'draft');

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
    if (rec.status === 'completed') {
      throw new AppError('لا يمكن استيراد كشف حساب لجلسة مطابقة مكتملة ومغلقة', 400);
    }

    const workbook = readSafeWorkbook(fileBuffer, { cellDates: true });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new AppError('الملف لا يحتوي على أي صفحات بيانات', 400);

    const sheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, any>[];

    if (!rawRows || rawRows.length === 0) {
      throw new AppError('لم يتم العثور على أي حركات في ملف كشف الحساب', 400);
    }

    const parsedTransactions: Array<{
      transaction_date: string;
      description: string;
      reference: string;
      debit: number;
      credit: number;
      amount: number;
    }> = [];

    for (const row of rawRows) {
      // البحث المرن عن الأعمدة باللغتين العربية والإنجليزية
      const keys = Object.keys(row);
      const findVal = (...patterns: string[]) => {
        for (const pattern of patterns) {
          const matchedKey = keys.find((k) =>
            k.toLowerCase().trim().includes(pattern.toLowerCase().trim()),
          );
          if (matchedKey && row[matchedKey] !== undefined && row[matchedKey] !== '') {
            return row[matchedKey];
          }
        }
        return '';
      };

      const rawDate = findVal('date', 'تاريخ', 'trans_date', 'التاريخ');
      const rawDesc = findVal('desc', 'وصف', 'بيان', 'تفاصيل', 'particular', 'details');
      const rawRef = findVal('ref', 'مرجع', 'شيك', 'cheque', 'check', 'رقم');
      const rawDebit = findVal('debit', 'مدين', 'سحب', 'withdrawal', 'out', 'منه');
      const rawCredit = findVal('credit', 'دائن', 'إيداع', 'deposit', 'in', 'له');
      const rawAmount = findVal('amount', 'مبلغ', 'قيمة', 'net');

      // معالجة التاريخ
      let dateStr = '';
      if (rawDate instanceof Date) {
        dateStr = rawDate.toISOString().slice(0, 10);
      } else if (typeof rawDate === 'string' && rawDate.trim()) {
        const d = new Date(rawDate.trim());
        if (!isNaN(d.getTime())) {
          dateStr = d.toISOString().slice(0, 10);
        }
      } else if (typeof rawDate === 'number') {
        // Excel serial date number
        const excelDate = new Date(Math.round((rawDate - 25569) * 86400 * 1000));
        if (!isNaN(excelDate.getTime())) {
          dateStr = excelDate.toISOString().slice(0, 10);
        }
      }

      if (!dateStr) {
        dateStr = rec.statement_date || new Date().toISOString().slice(0, 10);
      }

      const debitVal = roundMoney(Math.abs(Number(String(rawDebit).replace(/[^0-9.-]/g, '')) || 0));
      const creditVal = roundMoney(
        Math.abs(Number(String(rawCredit).replace(/[^0-9.-]/g, '')) || 0),
      );
      let amountVal = 0;

      if (creditVal > 0) {
        amountVal = creditVal;
      } else if (debitVal > 0) {
        amountVal = -debitVal;
      } else if (rawAmount) {
        amountVal = roundMoney(Number(String(rawAmount).replace(/[^0-9.-]/g, '')) || 0);
      }

      if (amountVal === 0 && debitVal === 0 && creditVal === 0) {
        continue; // تجاهل الأسطر الفارغة
      }

      const finalDebit = amountVal < 0 ? Math.abs(amountVal) : debitVal;
      const finalCredit = amountVal > 0 ? amountVal : creditVal;

      parsedTransactions.push({
        transaction_date: dateStr,
        description: String(rawDesc || filename || 'حركة كشف حساب').trim(),
        reference: String(rawRef || '').trim(),
        debit: finalDebit,
        credit: finalCredit,
        amount: roundMoney(finalCredit - finalDebit),
      });
    }

    if (parsedTransactions.length === 0) {
      throw new AppError('تعذر استخراج حركات مالية صالحة من الملف', 400);
    }

    const client = await getClient();
    try {
      await client.query('BEGIN');

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

      await client.query('COMMIT');

      return {
        reconciliation_id: reconciliationId,
        imported_count: parsedTransactions.length,
        transactions: await this.getStatementTransactions(reconciliationId),
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
    const res = await query(sql, params);

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
    const rec = await this.getReconciliationById(reconciliationId);
    if (rec.status === 'completed') {
      throw new AppError('جلسة المطابقة مكتملة ومغلقة بالفعل', 400);
    }

    const client = await getClient();
    try {
      await client.query('BEGIN');

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

      // 2. جلب قيود اليومية غير المطابقة للحساب البنكي
      const ledgerRes = await client.query(
        `SELECT 
           jel.id AS line_id,
           jel.debit,
           jel.credit,
           je.id AS journal_entry_id,
           je.entry_number,
           je.entry_date,
           je.description
         FROM journal_entry_lines jel
         JOIN journal_entries je ON je.id = jel.journal_entry_id
         WHERE jel.account_id = $1
           AND je.status = 'posted'
           AND je.id NOT IN (
             SELECT matched_journal_entry_id 
             FROM bank_statement_transactions 
             WHERE matched_journal_entry_id IS NOT NULL
           )
         ORDER BY je.entry_date ASC, je.id ASC`,
        [rec.account_id],
      );
      const candidateLines = ledgerRes.rows;

      // 3. جلب المدفوعات غير المطابقة (إن وُجدت)
      const paymentsRes = await client.query(
        `SELECT 
           p.id AS payment_id,
           p.payment_number,
           p.amount,
           p.reference_type,
           p.created_at::date AS payment_date
         FROM payments p
         WHERE p.id NOT IN (
           SELECT matched_payment_id 
           FROM bank_statement_transactions 
           WHERE matched_payment_id IS NOT NULL
         )
         ORDER BY p.created_at ASC`,
      );
      const candidatePayments = paymentsRes.rows;

      let matchedCount = 0;
      const usedLineIds = new Set<number>();
      const usedPaymentIds = new Set<number>();

      for (const tx of unmatchedTxs) {
        const txDate = new Date(tx.transaction_date).getTime();
        const txDebit = roundMoney(Number(tx.debit || 0));
        const txCredit = roundMoney(Number(tx.credit || 0));

        // من منظور محاسبي:
        // إيداع في البنك (Bank Credit) يقابله في دفتر الأستاذ مدين في حساب البنك (Ledger Debit)
        // سحب من البنك (Bank Debit) يقابله في دفتر الأستاذ دائن في حساب البنك (Ledger Credit)
        const targetLedgerDebit = txCredit;
        const targetLedgerCredit = txDebit;

        // مطابقة أسطر الأستاذ العام
        const matchedLine = candidateLines.find((line) => {
          if (usedLineIds.has(line.line_id)) return false;
          const lineDebit = roundMoney(Number(line.debit || 0));
          const lineCredit = roundMoney(Number(line.credit || 0));

          const amountMatches =
            (targetLedgerDebit > 0 && Math.abs(lineDebit - targetLedgerDebit) <= 0.01) ||
            (targetLedgerCredit > 0 && Math.abs(lineCredit - targetLedgerCredit) <= 0.01);

          if (!amountMatches) return false;

          // سماحية التاريخ: ±5 أيام
          const lineDate = new Date(line.entry_date).getTime();
          const daysDiff = Math.abs(txDate - lineDate) / (1000 * 60 * 60 * 24);
          return daysDiff <= 5;
        });

        if (matchedLine) {
          usedLineIds.add(matchedLine.line_id);
          await client.query(
            `UPDATE bank_statement_transactions 
             SET status = 'matched',
                 matched_journal_entry_id = $1,
                 matched_amount = $2,
                 notes = COALESCE(notes, '') || ' [مطابقة آلية مع قيد ' || $3 || ']'
             WHERE id = $4`,
            [
              matchedLine.journal_entry_id,
              Math.abs(Number(tx.amount)),
              matchedLine.entry_number,
              tx.id,
            ],
          );
          matchedCount++;
          continue;
        }

        // مطابقة جدول المدفوعات كخيار ثانٍ إن لم يطابق قيد مباشر
        const matchedPayment = candidatePayments.find((p) => {
          if (usedPaymentIds.has(p.payment_id)) return false;
          const pAmount = roundMoney(Number(p.amount || 0));
          const txAbsAmount = roundMoney(Math.abs(Number(tx.amount)));

          if (Math.abs(pAmount - txAbsAmount) > 0.01) return false;

          const pDate = new Date(p.payment_date).getTime();
          const daysDiff = Math.abs(txDate - pDate) / (1000 * 60 * 60 * 24);
          return daysDiff <= 5;
        });

        if (matchedPayment) {
          usedPaymentIds.add(matchedPayment.payment_id);
          await client.query(
            `UPDATE bank_statement_transactions 
             SET status = 'matched',
                 matched_payment_id = $1,
                 matched_amount = $2,
                 notes = COALESCE(notes, '') || ' [مطابقة آلية مع دفعة ' || $3 || ']'
             WHERE id = $4`,
            [
              matchedPayment.payment_id,
              Math.abs(Number(tx.amount)),
              matchedPayment.payment_number,
              tx.id,
            ],
          );
          matchedCount++;
        }
      }

      await client.query('COMMIT');

      return {
        reconciliation_id: reconciliationId,
        matched_count: matchedCount,
        remaining_unmatched: unmatchedTxs.length - matchedCount,
        transactions: await this.getStatementTransactions(reconciliationId),
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
  async matchTransaction(
    statementTxId: number,
    matchData: { journal_entry_id?: number; payment_id?: number; notes?: string },
  ) {
    if (!matchData.journal_entry_id && !matchData.payment_id) {
      throw new AppError('يجب تحديد قيد يومية أو دفعة للمطابقة', 400);
    }

    const txRes = await query(`SELECT * FROM bank_statement_transactions WHERE id = $1`, [
      statementTxId,
    ]);
    const tx = txRes.rows[0];
    if (!tx) throw new AppError('حركة كشف الحساب غير موجودة', 404);

    const rec = await this.getReconciliationById(tx.reconciliation_id);
    if (rec.status === 'completed') {
      throw new AppError('جلسة المطابقة مكتملة ومغلقة', 400);
    }

    const matchedAmount = roundMoney(Math.abs(Number(tx.amount)));

    const res = await query(
      `UPDATE bank_statement_transactions
       SET status = 'matched',
           matched_journal_entry_id = $1,
           matched_payment_id = $2,
           matched_amount = $3,
           notes = COALESCE($4, notes)
       WHERE id = $5
       RETURNING *`,
      [
        matchData.journal_entry_id || null,
        matchData.payment_id || null,
        matchedAmount,
        matchData.notes || null,
        statementTxId,
      ],
    );

    return res.rows[0];
  },

  /**
   * إلغاء مطابقة حركة كشف حساب (Unmatch)
   */
  async unmatchTransaction(statementTxId: number) {
    const txRes = await query(`SELECT * FROM bank_statement_transactions WHERE id = $1`, [
      statementTxId,
    ]);
    const tx = txRes.rows[0];
    if (!tx) throw new AppError('حركة كشف الحساب غير موجودة', 404);

    const rec = await this.getReconciliationById(tx.reconciliation_id);
    if (rec.status === 'completed') {
      throw new AppError('لا يمكن تعديل جلسة مطابقة مكتملة ومغلقة', 400);
    }

    const res = await query(
      `UPDATE bank_statement_transactions
       SET status = 'unmatched',
           matched_journal_entry_id = NULL,
           matched_payment_id = NULL,
           matched_amount = 0
       WHERE id = $1
       RETURNING *`,
      [statementTxId],
    );

    return res.rows[0];
  },

  /**
   * استبعاد حركة من المطابقة (Exclude)
   */
  async excludeTransaction(statementTxId: number, reason: string) {
    if (!reason || !reason.trim()) {
      throw new AppError('سبب الاستبعاد إلزامي', 400);
    }

    const txRes = await query(`SELECT * FROM bank_statement_transactions WHERE id = $1`, [
      statementTxId,
    ]);
    const tx = txRes.rows[0];
    if (!tx) throw new AppError('حركة كشف الحساب غير موجودة', 404);

    const res = await query(
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

    return res.rows[0];
  },

  /**
   * اعتماد وإغلاق جلسة المطابقة الصارم (Difference = 0 Enforcement)
   */
  async finalizeReconciliation(reconciliationId: number, userId: number) {
    const rec = await this.getReconciliationById(reconciliationId);
    if (rec.status === 'completed') {
      throw new AppError('جلسة المطابقة معتمدة ومكتملة بالفعل', 400);
    }

    // التحقق من الحركات غير المطابقة
    const txStatsRes = await query(
      `SELECT 
         COUNT(*) AS total_count,
         COUNT(CASE WHEN status = 'unmatched' THEN 1 END) AS unmatched_count
       FROM bank_statement_transactions
       WHERE reconciliation_id = $1`,
      [reconciliationId],
    );
    const { total_count, unmatched_count } = txStatsRes.rows[0];

    // إعادة حساب رصيد الأستاذ في تاريخ الكشف للتأكد من عدم تغيره
    const latestLedgerBalance = await this.getLedgerBalanceAsOfDate(
      rec.account_id,
      rec.statement_date,
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

    const client = await getClient();
    try {
      await client.query('BEGIN');

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
