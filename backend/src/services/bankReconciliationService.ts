/**
 * bankReconciliationService.ts — خدمة مطابقة وتسوية الحسابات البنكية والخزينة
 * ═══════════════════════════════════════════════════════════════════════════
 * يتيح مطابقة كشوف الحسابات البنكية والخزينة مع رصيد دفتر الأستاذ العام (GL)
 * وحساب الفروقات وتوثيق جلسات التسوية الشهرية والدورية.
 */

import { query, getClient } from '../database/pool.ts';
import { AppError } from '../types/errors.ts';
import { roundMoney } from '../utils/money.ts';

export interface CreateReconciliationInput {
  account_id: number;
  statement_date: string;
  statement_balance: number;
  notes?: string;
  status?: 'draft' | 'completed' | 'cancelled';
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
        u.full_name AS reconciled_by_name
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
        u.full_name AS reconciled_by_name
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
    };
  },

  /**
   * حساب رصيد دفتر الأستاذ لحساب معين حتى تاريخ محدد
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
      LEFT JOIN journal_entry_lines jel ON jel.account_id = a.id
      LEFT JOIN journal_entries je ON je.id = jel.journal_entry_id 
        AND je.status = 'posted' 
        AND je.entry_date <= $2::date
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
    const status = data.status || 'completed';

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
};
