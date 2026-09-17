/**
 * accountingService.ts — المحرك المحاسبي المتكامل ونظام الأستاذ العام (General Ledger)
 * ═════════════════════════════════════════════════════════════════════════════════
 * يوفر:
 *  - دليل الحسابات (Chart of Accounts)
 *  - قيود اليومية المزدوجة المتوازنة (Debit = Credit)
 *  - الترحيل المحاسبي التلقائي للعمليات (مبيعات، مشتريات، مصاريف، مرتجعات، مدفوعات)
 *  - دفتر الأستاذ العام مع الرصيد التراكمي (General Ledger with Running Balance)
 *  - ميزان المراجعة (Trial Balance)
 *  - الميزانية العمومية (Balance Sheet) وقائمة الدخل الدفترية (Income Statement)
 */

import { query, getClient } from '../database/pool.ts';
import { AppError } from '../types/errors.ts';
import { roundMoney, sumMoney } from '../utils/money.ts';
import { appCache } from '../utils/cache.ts';

// أكواد الحسابات القياسية الافتراضية
export const STANDARD_ACCOUNTS = {
  // الأصول
  MAIN_TREASURY: '110101', // الخزينة الرئيسية
  BRANCH_DRAWER: '110102', // نقدية الفرع والورديات
  BANK_ACCOUNTS: '110103', // الحسابات البنكية
  E_WALLETS: '110104', // المحافظ الإلكترونية وإنستاباي
  CUSTOMERS_RECEIVABLE: '110201', // عملاء الجملة والآجل
  FINISHED_GOODS: '110301', // مخزون البن والمنتجات التامة
  RAW_MATERIALS: '110302', // مخزون المواد الخام
  // الالتزامات
  SUPPLIERS_PAYABLE: '210101', // موردو البن والخامات
  VAT_PAYABLE: '210201', // أمانات ضريبة القيمة المضافة
  ACCRUED_PAYROLL: '210301', // الرواتب والأجور المستحقة
  // حقوق الملكية
  CAPITAL: '3101', // رأس المال
  RETAINED_EARNINGS: '3102', // الأرباح المبقاة
  PARTNER_DRAWINGS: '3103', // جاري الشركاء والمسحوبات
  // الإيرادات
  POS_SALES_REVENUE: '4101', // إيرادات مبيعات الفروع والكاشير
  WHOLESALE_SALES_REVENUE: '4102', // إيرادات مبيعات الجملة
  SALES_RETURNS_ALLOWANCE: '4103', // مردودات ومسموحات المبيعات
  OTHER_INCOME: '4201', // فروقات وزيادات دائنة
  // المصروفات وتكلفة البضاعة
  COGS_POS: '5101', // تكلفة البضاعة المباعة - فروع
  COGS_WHOLESALE: '5102', // تكلفة البضاعة المباعة - جملة
  WASTE_EXPENSE: '5103', // هدر وفواقد التشغيل
  SALARIES_EXPENSE: '5201', // الرواتب والأجور
  RENT_UTILITIES: '5202', // الإيجارات والمرافق
  MAINTENANCE_EXPENSE: '5203', // الصيانة وقطع الغيار
  SHORTAGE_EXPENSE: '5204', // عجز النقدية وفروقات الجرد
  GENERAL_EXPENSE: '5205', // مصروفات تشغيلية عامة
};

export interface JournalLineInput {
  account_id?: number;
  account_code?: string;
  debit: number;
  credit: number;
  description?: string;
  warehouse_id?: number;
}

export interface CreateJournalEntryInput {
  entry_date?: string;
  reference_type?:
    | 'sale'
    | 'purchase'
    | 'payment'
    | 'expense'
    | 'payroll'
    | 'stocktake'
    | 'purchase_return'
    | 'manual'
    | 'opening'
    | 'transfer';
  reference_id?: number;
  description: string;
  lines: JournalLineInput[];
  created_by?: number;
  status?: 'posted' | 'draft';
}

const CACHE_KEY_COA = 'chart_of_accounts_tree';

export const accountingService = {
  // ─── 1. شجرة الحسابات (Chart of Accounts) ──────────────────────────────────

  async getAccounts(
    filters: { account_type?: string; is_active?: boolean; parent_id?: number } = {},
  ) {
    let sql = `SELECT * FROM accounts WHERE 1=1`;
    const params: any[] = [];

    if (filters.account_type) {
      params.push(filters.account_type);
      sql += ` AND account_type = $${params.length}`;
    }
    if (filters.is_active !== undefined) {
      params.push(filters.is_active);
      sql += ` AND is_active = $${params.length}`;
    }
    if (filters.parent_id !== undefined) {
      params.push(filters.parent_id);
      sql += ` AND parent_id = $${params.length}`;
    }

    sql += ` ORDER BY code ASC`;
    const res = await query(sql, params);
    return res.rows;
  },

  async getAccountById(id: number) {
    const res = await query(`SELECT * FROM accounts WHERE id = $1`, [id]);
    return res.rows[0] || null;
  },

  async getAccountByCode(code: string) {
    const res = await query(`SELECT * FROM accounts WHERE code = $1`, [code]);
    return res.rows[0] || null;
  },

  async createAccount(data: {
    code: string;
    name_ar: string;
    name_en?: string;
    account_type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
    normal_balance?: 'debit' | 'credit';
    parent_id?: number;
    description?: string;
  }) {
    if (!data.code || !data.name_ar || !data.account_type) {
      throw new AppError('الكود واسم الحساب ونوعه متطلبات إلزامية', 400);
    }

    const existing = await query(`SELECT id FROM accounts WHERE code = $1`, [data.code]);
    if (existing.rows[0]) {
      throw new AppError(`كود الحساب "${data.code}" مستخدم بالفعل`, 409);
    }

    // تحديد الطبيعة الافتراضية للحساب إن لم تحدد
    let normalBalance = data.normal_balance;
    if (!normalBalance) {
      normalBalance =
        data.account_type === 'asset' || data.account_type === 'expense' ? 'debit' : 'credit';
    }

    const res = await query(
      `INSERT INTO accounts (code, name_ar, name_en, account_type, normal_balance, parent_id, description, is_system)
       VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE)
       RETURNING *`,
      [
        data.code.trim(),
        data.name_ar.trim(),
        data.name_en?.trim() || null,
        data.account_type,
        normalBalance,
        data.parent_id || null,
        data.description?.trim() || null,
      ],
    );

    appCache.delete(CACHE_KEY_COA);
    return res.rows[0];
  },

  async updateAccount(
    id: number,
    data: { name_ar?: string; name_en?: string; is_active?: boolean; description?: string },
  ) {
    const account = await this.getAccountById(id);
    if (!account) throw new AppError('الحساب غير موجود', 404);

    const res = await query(
      `UPDATE accounts
       SET name_ar = COALESCE($1, name_ar),
           name_en = COALESCE($2, name_en),
           is_active = COALESCE($3, is_active),
           description = COALESCE($4, description),
           updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [
        data.name_ar?.trim() || null,
        data.name_en?.trim() || null,
        data.is_active,
        data.description?.trim() || null,
        id,
      ],
    );

    appCache.delete(CACHE_KEY_COA);
    return res.rows[0];
  },

  // ─── 2. قيود اليومية (Journal Entries) ──────────────────────────────────────

  async generateEntryNumber(client: any): Promise<string> {
    const yy = new Date().getFullYear();
    const res = await client.query(`SELECT nextval('seq_journal_entries_number') AS n`);
    return `JE-${yy}-${String(res.rows[0].n).padStart(5, '0')}`;
  },

  /**
   * إنشاء قيد يومية متوازن مع التحقق الحسابي الدقيق (Debit == Credit)
   */
  async createJournalEntry(data: CreateJournalEntryInput, providedClient?: any) {
    if (!data.lines || data.lines.length < 2) {
      throw new AppError('قيد اليومية يجب أن يحتوي على طرفين على الأقل (مدين ودائن)', 400);
    }

    let totalDebit = 0;
    let totalCredit = 0;

    for (const line of data.lines) {
      const d = roundMoney(Number(line.debit || 0));
      const c = roundMoney(Number(line.credit || 0));

      if (d < 0 || c < 0) {
        throw new AppError('المبالغ المدينة والدائنة يجب أن تكون موجبة أو صفر', 400);
      }
      if (d > 0 && c > 0) {
        throw new AppError('السطر الواحد لا يمكن أن يكون مديناً ودائناً في نفس الوقت', 400);
      }
      if (d === 0 && c === 0) {
        throw new AppError('يجب تحديد مبلغ مدين أو دائن لكل سطر', 400);
      }

      totalDebit = sumMoney(totalDebit, d);
      totalCredit = sumMoney(totalCredit, c);
    }

    // التحقق الصارم من التوازن المحاسبي: مجموع المدين = مجموع الدائن
    const imbalance = Math.abs(roundMoney(totalDebit - totalCredit));
    if (imbalance > 0.01) {
      throw new AppError(
        `قيد اليومية غير متوازن! إجمالي المدين (${totalDebit}) لا يساوي إجمالي الدائن (${totalCredit}) الفارق: ${imbalance}`,
        400,
      );
    }

    const client = providedClient || (await getClient());
    const shouldManageTransaction = !providedClient;

    try {
      if (shouldManageTransaction) await client.query('BEGIN');

      const entryNumber = await this.generateEntryNumber(client);
      const status = data.status || 'posted';

      const entryRes = await client.query(
        `INSERT INTO journal_entries (entry_number, entry_date, status, reference_type, reference_id, description, created_by)
         VALUES ($1, COALESCE($2::date, CURRENT_DATE), $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          entryNumber,
          data.entry_date || null,
          status,
          data.reference_type || 'manual',
          data.reference_id || null,
          data.description.trim(),
          data.created_by || null,
        ],
      );
      const entry = entryRes.rows[0];

      // إدخال سطور القيد بعد تحويل كود الحساب إلى ID إن لزم
      for (const line of data.lines) {
        let accountId = line.account_id;
        if (!accountId && line.account_code) {
          const accRes = await client.query(`SELECT id FROM accounts WHERE code = $1`, [
            line.account_code,
          ]);
          if (!accRes.rows[0]) {
            throw new AppError(
              `الحساب بالكود "${line.account_code}" غير موجود في شجرة الحسابات`,
              404,
            );
          }
          accountId = accRes.rows[0].id;
        }

        if (!accountId) throw new AppError('رقم الحساب مطلوب لكل سطر في القيد', 400);

        await client.query(
          `INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, description, warehouse_id)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            entry.id,
            accountId,
            roundMoney(Number(line.debit || 0)),
            roundMoney(Number(line.credit || 0)),
            line.description?.trim() || null,
            line.warehouse_id || null,
          ],
        );
      }

      if (shouldManageTransaction) await client.query('COMMIT');
      return {
        ...entry,
        total_debit: totalDebit,
        total_credit: totalCredit,
      };
    } catch (err) {
      if (shouldManageTransaction) await client.query('ROLLBACK');
      throw err;
    } finally {
      if (shouldManageTransaction) client.release();
    }
  },

  // ─── 3. الترحيل المحاسبي التلقائي للعمليات (Auto-Posting) ──────────────────

  /**
   * ترحيل قيد مبيعات فوري
   * 1) إثبات الإيراد: مدين (الخزينة/العميل) ودائن (إيراد المبيعات) + دائن (ضريبة القيمة المضافة إن وجدت)
   * 2) إثبات التكلفة: مدين (تكلفة البضاعة المباعة COGS) ودائن (المخزون السلعي)
   */
  async postSaleJournalEntry(
    client: any,
    sale: {
      id: number;
      sale_number: string;
      sale_type: 'pos' | 'branch' | 'wholesale';
      total_amount: number;
      cost_amount?: number;
      tax_amount?: number;
      payment_method?: string;
      customer_id?: number;
      warehouse_id?: number;
      user_id?: number;
    },
  ) {
    const totalAmount = roundMoney(Number(sale.total_amount || 0));
    if (totalAmount <= 0) return;

    const taxAmount = roundMoney(Number(sale.tax_amount || 0));
    const netRevenue = roundMoney(totalAmount - taxAmount);
    const costAmount = roundMoney(Number(sale.cost_amount || 0));

    // تحديد حساب القبض المناسب بناءً على طريقة الدفع ونوع البيع
    let debitAccountCode = STANDARD_ACCOUNTS.BRANCH_DRAWER;
    const method = (sale.payment_method || 'cash').toLowerCase();

    if (sale.sale_type === 'wholesale') {
      debitAccountCode = sale.customer_id
        ? STANDARD_ACCOUNTS.CUSTOMERS_RECEIVABLE
        : STANDARD_ACCOUNTS.MAIN_TREASURY;
    } else if (method === 'card' || method === 'visa') {
      debitAccountCode = STANDARD_ACCOUNTS.BANK_ACCOUNTS;
    } else if (method === 'transfer' || method === 'instapay' || method === 'wallet') {
      debitAccountCode = STANDARD_ACCOUNTS.E_WALLETS;
    }

    const revenueAccountCode =
      sale.sale_type === 'wholesale'
        ? STANDARD_ACCOUNTS.WHOLESALE_SALES_REVENUE
        : STANDARD_ACCOUNTS.POS_SALES_REVENUE;

    const lines: JournalLineInput[] = [];

    // طرف المدين (النقدية / البنك / العميل)
    lines.push({
      account_code: debitAccountCode,
      debit: totalAmount,
      credit: 0,
      description: `تحصيل/استحقاق مبيعات ${sale.sale_number}`,
      warehouse_id: sale.warehouse_id,
    });

    // طرف الدائن (الإيراد الصافي)
    lines.push({
      account_code: revenueAccountCode,
      debit: 0,
      credit: netRevenue,
      description: `إيراد مبيعات ${sale.sale_number}`,
      warehouse_id: sale.warehouse_id,
    });

    // طرف الدائن (الضريبة إن وجدت)
    if (taxAmount > 0) {
      lines.push({
        account_code: STANDARD_ACCOUNTS.VAT_PAYABLE,
        debit: 0,
        credit: taxAmount,
        description: `أمانات ضريبة مبيعات ${sale.sale_number}`,
        warehouse_id: sale.warehouse_id,
      });
    }

    // قيد التكلفة والمخزون التلقائي (COGS)
    if (costAmount > 0) {
      const cogsAccountCode =
        sale.sale_type === 'wholesale'
          ? STANDARD_ACCOUNTS.COGS_WHOLESALE
          : STANDARD_ACCOUNTS.COGS_POS;

      lines.push({
        account_code: cogsAccountCode,
        debit: costAmount,
        credit: 0,
        description: `تكلفة بضاعة مباعة ${sale.sale_number}`,
        warehouse_id: sale.warehouse_id,
      });

      lines.push({
        account_code: STANDARD_ACCOUNTS.FINISHED_GOODS,
        debit: 0,
        credit: costAmount,
        description: `صرف مخزون لمبيعات ${sale.sale_number}`,
        warehouse_id: sale.warehouse_id,
      });
    }

    return this.createJournalEntry(
      {
        reference_type: 'sale',
        reference_id: sale.id,
        description: `إثبات قيد مبيعات ${sale.sale_number}`,
        lines,
        created_by: sale.user_id,
      },
      client,
    );
  },

  /**
   * ترحيل قيد فاتورة مشتريات
   * مدين: المخزون السلعي (أو المواد الخام)
   * دائن: الموردون (أو الخزينة عند الدفع الفوري)
   */
  async postPurchaseJournalEntry(
    client: any,
    purchase: {
      id: number;
      invoice_number: string;
      total_amount: number;
      tax_amount?: number;
      payment_status?: string;
      supplier_id?: number;
      warehouse_id?: number;
      user_id?: number;
    },
  ) {
    const totalAmount = roundMoney(Number(purchase.total_amount || 0));
    if (totalAmount <= 0) return;

    const creditAccountCode =
      purchase.payment_status === 'paid'
        ? STANDARD_ACCOUNTS.MAIN_TREASURY
        : STANDARD_ACCOUNTS.SUPPLIERS_PAYABLE;

    const lines: JournalLineInput[] = [
      {
        account_code: STANDARD_ACCOUNTS.FINISHED_GOODS,
        debit: totalAmount,
        credit: 0,
        description: `إضافة مخزون مشتريات فاتورة ${purchase.invoice_number}`,
        warehouse_id: purchase.warehouse_id,
      },
      {
        account_code: creditAccountCode,
        debit: 0,
        credit: totalAmount,
        description: `استحقاق مورد فاتورة مشتريات ${purchase.invoice_number}`,
        warehouse_id: purchase.warehouse_id,
      },
    ];

    return this.createJournalEntry(
      {
        reference_type: 'purchase',
        reference_id: purchase.id,
        description: `إثبات فاتورة مشتريات ${purchase.invoice_number}`,
        lines,
        created_by: purchase.user_id,
      },
      client,
    );
  },

  /**
   * ترحيل قيد مرتجع مشتريات (إشعار مدين Debit Note)
   * مدين: الموردون (تخفيض مديونية المورد)
   * دائن: المخزون السلعي (تخفيض المخزون المرتجع)
   */
  async postPurchaseReturnJournalEntry(
    client: any,
    returnDoc: {
      id: number;
      return_number: string;
      total_amount: number;
      supplier_id?: number;
      warehouse_id?: number;
      user_id?: number;
    },
  ) {
    const totalAmount = roundMoney(Number(returnDoc.total_amount || 0));
    if (totalAmount <= 0) return;

    const lines: JournalLineInput[] = [
      {
        account_code: STANDARD_ACCOUNTS.SUPPLIERS_PAYABLE,
        debit: totalAmount,
        credit: 0,
        description: `تخفيض مستحقات مورد لمرتجع ${returnDoc.return_number}`,
        warehouse_id: returnDoc.warehouse_id,
      },
      {
        account_code: STANDARD_ACCOUNTS.FINISHED_GOODS,
        debit: 0,
        credit: totalAmount,
        description: `خصم مخزون بضاعة مرتجعة ${returnDoc.return_number}`,
        warehouse_id: returnDoc.warehouse_id,
      },
    ];

    return this.createJournalEntry(
      {
        reference_type: 'purchase_return',
        reference_id: returnDoc.id,
        description: `إثبات قيد مرتجع مشتريات ${returnDoc.return_number}`,
        lines,
        created_by: returnDoc.user_id,
      },
      client,
    );
  },

  /**
   * ترحيل قيد سداد/تحصيل نقدي
   */
  async postPaymentJournalEntry(
    client: any,
    payment: {
      id: number;
      payment_number: string;
      reference_type: 'sale' | 'invoice' | 'supplier' | 'expense';
      amount: number;
      payment_method?: string;
      user_id?: number;
    },
  ) {
    const amount = roundMoney(Number(payment.amount || 0));
    if (amount <= 0) return;

    const method = (payment.payment_method || 'cash').toLowerCase();
    const treasuryAccount =
      method === 'card' ? STANDARD_ACCOUNTS.BANK_ACCOUNTS : STANDARD_ACCOUNTS.MAIN_TREASURY;

    const lines: JournalLineInput[] = [];

    if (payment.reference_type === 'sale' || payment.reference_type === 'invoice') {
      // تحصيل من عميل: مدين الخزينة، دائن العملاء
      lines.push({
        account_code: treasuryAccount,
        debit: amount,
        credit: 0,
        description: `تحصيل دفعة ${payment.payment_number}`,
      });
      lines.push({
        account_code: STANDARD_ACCOUNTS.CUSTOMERS_RECEIVABLE,
        debit: 0,
        credit: amount,
        description: `سداد عميل دفعة ${payment.payment_number}`,
      });
    } else if (payment.reference_type === 'supplier') {
      // سداد لمورد: مدين الموردين، دائن الخزينة
      lines.push({
        account_code: STANDARD_ACCOUNTS.SUPPLIERS_PAYABLE,
        debit: amount,
        credit: 0,
        description: `سداد دفعة للمورد ${payment.payment_number}`,
      });
      lines.push({
        account_code: treasuryAccount,
        debit: 0,
        credit: amount,
        description: `صرف نقدي لسداد مورد ${payment.payment_number}`,
      });
    }

    if (lines.length === 2) {
      return this.createJournalEntry(
        {
          reference_type: 'payment',
          reference_id: payment.id,
          description: `إثبات حركة سداد ${payment.payment_number}`,
          lines,
          created_by: payment.user_id,
        },
        client,
      );
    }
  },

  // ─── 4. التقارير المالية الدفترية الرسمية (GL, TB, Balance Sheet) ──────────

  /**
   * دفتر الأستاذ العام (General Ledger) مع الرصيد التراكمي
   */
  async getGeneralLedger(params: {
    account_id?: number;
    account_code?: string;
    from_date?: string;
    to_date?: string;
    warehouse_id?: number;
  }) {
    let account: any = null;
    if (params.account_id) {
      account = await this.getAccountById(params.account_id);
    } else if (params.account_code) {
      account = await this.getAccountByCode(params.account_code);
    }

    if (!account) throw new AppError('يرجى تحديد حساب صالح لعرض دفتر الأستاذ', 400);

    const fromDate = params.from_date || '2000-01-01';
    const toDate = params.to_date || '2099-12-31';

    // 1. حساب الرصيد الافتتاحي ما قبل from_date
    const openRes = await query(
      `SELECT
         COALESCE(SUM(jel.debit), 0) AS total_debit,
         COALESCE(SUM(jel.credit), 0) AS total_credit
       FROM journal_entry_lines jel
       JOIN journal_entries je ON je.id = jel.journal_entry_id
       WHERE jel.account_id = $1
         AND je.status = 'posted'
         AND je.entry_date < $2::date`,
      [account.id, fromDate],
    );

    const openDebit = Number(openRes.rows[0].total_debit);
    const openCredit = Number(openRes.rows[0].total_credit);
    const isDebitNormal = account.normal_balance === 'debit';
    const openingBalance = isDebitNormal ? openDebit - openCredit : openCredit - openDebit;

    // 2. حركات الفترة المحددة
    const movesRes = await query(
      `SELECT
         je.id as entry_id,
         je.entry_number,
         je.entry_date,
         je.reference_type,
         je.reference_id,
         je.description as entry_description,
         jel.id as line_id,
         jel.debit,
         jel.credit,
         jel.description as line_description,
         jel.warehouse_id,
         w.name_ar as warehouse_name
       FROM journal_entry_lines jel
       JOIN journal_entries je ON je.id = jel.journal_entry_id
       LEFT JOIN warehouses w ON w.id = jel.warehouse_id
       WHERE jel.account_id = $1
         AND je.status = 'posted'
         AND je.entry_date BETWEEN $2::date AND $3::date
       ORDER BY je.entry_date ASC, je.id ASC, jel.id ASC`,
      [account.id, fromDate, toDate],
    );

    let runningBalance = openingBalance;
    const entries = movesRes.rows.map((row) => {
      const d = Number(row.debit);
      const c = Number(row.credit);
      if (isDebitNormal) {
        runningBalance = roundMoney(runningBalance + d - c);
      } else {
        runningBalance = roundMoney(runningBalance + c - d);
      }
      return {
        ...row,
        debit: d,
        credit: c,
        running_balance: runningBalance,
      };
    });

    const periodDebit = entries.reduce((s, e) => sumMoney(s, e.debit), 0);
    const periodCredit = entries.reduce((s, e) => sumMoney(s, e.credit), 0);

    return {
      account,
      period: { from_date: fromDate, to_date: toDate },
      opening_balance: roundMoney(openingBalance),
      period_debit: periodDebit,
      period_credit: periodCredit,
      closing_balance: roundMoney(runningBalance),
      entries,
    };
  },

  /**
   * ميزان المراجعة (Trial Balance) — التوازن الإلزامي: إجمالي المدين = إجمالي الدائن
   */
  async getTrialBalance(params: { from_date?: string; to_date?: string }) {
    const fromDate = params.from_date || '2000-01-01';
    const toDate = params.to_date || '2099-12-31';

    const sql = `
      WITH opening_moves AS (
        SELECT
          jel.account_id,
          COALESCE(SUM(jel.debit), 0) AS open_debit,
          COALESCE(SUM(jel.credit), 0) AS open_credit
        FROM journal_entry_lines jel
        JOIN journal_entries je ON je.id = jel.journal_entry_id
        WHERE je.status = 'posted' AND je.entry_date < $1::date
        GROUP BY jel.account_id
      ),
      period_moves AS (
        SELECT
          jel.account_id,
          COALESCE(SUM(jel.debit), 0) AS cur_debit,
          COALESCE(SUM(jel.credit), 0) AS cur_credit
        FROM journal_entry_lines jel
        JOIN journal_entries je ON je.id = jel.journal_entry_id
        WHERE je.status = 'posted' AND je.entry_date BETWEEN $1::date AND $2::date
        GROUP BY jel.account_id
      )
      SELECT
        a.id,
        a.code,
        a.name_ar,
        a.name_en,
        a.account_type,
        a.normal_balance,
        COALESCE(om.open_debit, 0) AS opening_debit,
        COALESCE(om.open_credit, 0) AS opening_credit,
        COALESCE(pm.cur_debit, 0) AS period_debit,
        COALESCE(pm.cur_credit, 0) AS period_credit
      FROM accounts a
      LEFT JOIN opening_moves om ON om.account_id = a.id
      LEFT JOIN period_moves pm ON pm.account_id = a.id
      WHERE a.is_active = TRUE
      ORDER BY a.code ASC
    `;

    const res = await query(sql, [fromDate, toDate]);

    let sumOpeningDebit = 0;
    let sumOpeningCredit = 0;
    let sumPeriodDebit = 0;
    let sumPeriodCredit = 0;
    let sumClosingDebit = 0;
    let sumClosingCredit = 0;

    const rows = res.rows.map((r) => {
      const openD = Number(r.opening_debit);
      const openC = Number(r.opening_credit);
      const curD = Number(r.period_debit);
      const curC = Number(r.period_credit);

      const netTotal = openD + curD - (openC + curC);
      let closingDebit = 0;
      let closingCredit = 0;

      if (netTotal > 0) {
        closingDebit = roundMoney(netTotal);
      } else if (netTotal < 0) {
        closingCredit = roundMoney(Math.abs(netTotal));
      }

      sumOpeningDebit = sumMoney(sumOpeningDebit, openD);
      sumOpeningCredit = sumMoney(sumOpeningCredit, openC);
      sumPeriodDebit = sumMoney(sumPeriodDebit, curD);
      sumPeriodCredit = sumMoney(sumPeriodCredit, curC);
      sumClosingDebit = sumMoney(sumClosingDebit, closingDebit);
      sumClosingCredit = sumMoney(sumClosingCredit, closingCredit);

      return {
        id: r.id,
        code: r.code,
        name_ar: r.name_ar,
        name_en: r.name_en,
        account_type: r.account_type,
        normal_balance: r.normal_balance,
        opening_debit: openD,
        opening_credit: openC,
        period_debit: curD,
        period_credit: curC,
        closing_debit: closingDebit,
        closing_credit: closingCredit,
      };
    });

    const isBalanced = Math.abs(roundMoney(sumClosingDebit - sumClosingCredit)) <= 0.01;

    return {
      period: { from_date: fromDate, to_date: toDate },
      totals: {
        opening_debit: sumOpeningDebit,
        opening_credit: sumOpeningCredit,
        period_debit: sumPeriodDebit,
        period_credit: sumPeriodCredit,
        closing_debit: sumClosingDebit,
        closing_credit: sumClosingCredit,
        is_balanced: isBalanced,
        variance: roundMoney(sumClosingDebit - sumClosingCredit),
      },
      accounts: rows,
    };
  },

  /**
   * الميزانية العمومية (Balance Sheet): الأصول = الخصوم + حقوق الملكية
   */
  async getBalanceSheet(asOfDate: string = new Date().toISOString().slice(0, 10)) {
    // نجلب ميزان المراجعة حتى هذا التاريخ
    const tb = await this.getTrialBalance({ from_date: '2000-01-01', to_date: asOfDate });

    const assets: any[] = [];
    const liabilities: any[] = [];
    const equity: any[] = [];

    let totalAssets = 0;
    let totalLiabilities = 0;
    let totalEquity = 0;
    let netIncome = 0; // إيرادات - مصروفات حتى تاريخه

    for (const acc of tb.accounts) {
      const net = (acc.closing_debit || 0) - (acc.closing_credit || 0);

      if (acc.account_type === 'asset') {
        const val = roundMoney(net);
        totalAssets = sumMoney(totalAssets, val);
        assets.push({ ...acc, balance: val });
      } else if (acc.account_type === 'liability') {
        const val = roundMoney(-net);
        totalLiabilities = sumMoney(totalLiabilities, val);
        liabilities.push({ ...acc, balance: val });
      } else if (acc.account_type === 'equity') {
        const val = roundMoney(-net);
        totalEquity = sumMoney(totalEquity, val);
        equity.push({ ...acc, balance: val });
      } else if (acc.account_type === 'revenue') {
        netIncome = sumMoney(netIncome, -net);
      } else if (acc.account_type === 'expense') {
        netIncome = roundMoney(netIncome - net);
      }
    }

    // يضاف صافي الربح للفترة إلى حقوق الملكية
    const totalEquityWithIncome = sumMoney(totalEquity, netIncome);
    const isBalanced =
      Math.abs(roundMoney(totalAssets - (totalLiabilities + totalEquityWithIncome))) <= 0.01;

    return {
      as_of_date: asOfDate,
      assets: { items: assets, total: totalAssets },
      liabilities: { items: liabilities, total: totalLiabilities },
      equity: {
        items: equity,
        current_period_net_income: netIncome,
        total: totalEquityWithIncome,
      },
      total_liabilities_and_equity: sumMoney(totalLiabilities, totalEquityWithIncome),
      is_balanced: isBalanced,
      variance: roundMoney(totalAssets - (totalLiabilities + totalEquityWithIncome)),
    };
  },
};
