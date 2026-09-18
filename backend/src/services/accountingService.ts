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
    | 'transfer'
    | 'reversal';
  reference_id?: number | string;
  description: string;
  lines: JournalLineInput[];
  created_by?: number;
  status?: 'posted' | 'draft';
  idempotency_key?: string;
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
    if (imbalance > 0.0001) {
      throw new AppError(
        `قيد اليومية غير متوازن! إجمالي المدين (${totalDebit}) لا يساوي إجمالي الدائن (${totalCredit}) الفارق: ${imbalance}`,
        400,
      );
    }

    const client = providedClient || (await getClient());
    const shouldManageTransaction = !providedClient;

    try {
      if (shouldManageTransaction) await client.query('BEGIN');

      // فحص ومنع تكرار القيود باستخدام مفتاح عدم التكرار وقفل المعاملة (Advisory Lock)
      if (data.idempotency_key) {
        await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [data.idempotency_key]);

        const existingRes = await client.query(
          `SELECT je.*,
                  COALESCE((SELECT SUM(debit) FROM journal_entry_lines WHERE journal_entry_id = je.id), 0) AS total_debit,
                  COALESCE((SELECT SUM(credit) FROM journal_entry_lines WHERE journal_entry_id = je.id), 0) AS total_credit
           FROM journal_entries je 
           WHERE je.idempotency_key = $1`,
          [data.idempotency_key],
        );
        if (existingRes.rows.length > 0) {
          const existing = existingRes.rows[0];
          if (shouldManageTransaction) await client.query('COMMIT');
          return {
            ...existing,
            total_debit: roundMoney(Number(existing.total_debit)),
            total_credit: roundMoney(Number(existing.total_credit)),
            is_idempotent_duplicate: true,
          };
        }
      }

      const entryNumber = await this.generateEntryNumber(client);
      const status = data.status || 'posted';

      const entryRes = await client.query(
        `INSERT INTO journal_entries (entry_number, entry_date, status, reference_type, reference_id, description, created_by, idempotency_key)
         VALUES ($1, COALESCE($2::date, CURRENT_DATE), $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          entryNumber,
          data.entry_date || null,
          status,
          data.reference_type || 'manual',
          data.reference_id || null,
          data.description.trim(),
          data.created_by || null,
          data.idempotency_key || null,
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
      sale_date?: string;
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
        entry_date: sale.sale_date,
        reference_type: 'sale',
        reference_id: sale.id,
        idempotency_key: `sale:${sale.id}`,
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
      invoice_date?: string;
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
        entry_date: purchase.invoice_date,
        reference_type: 'purchase',
        reference_id: purchase.id,
        idempotency_key: `purchase:${purchase.id}`,
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
      return_date?: string;
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
        entry_date: returnDoc.return_date,
        reference_type: 'purchase_return',
        reference_id: returnDoc.id,
        idempotency_key: `purchase_return:${returnDoc.id}`,
        description: `إثبات قيد مرتجع مشتريات ${returnDoc.return_number}`,
        lines,
        created_by: returnDoc.user_id,
      },
      client,
    );
  },

  /**
   * ترحيل قيد فروقات الجرد المخزني (عجز أو فائض) إلى الأستاذ العام
   */
  async postStocktakeJournalEntry(
    client: any,
    stocktake: {
      id: number | string;
      warehouse_id: number;
      total_deficit: number;
      total_surplus: number;
      user_id?: number;
    },
  ) {
    const deficit = roundMoney(Number(stocktake.total_deficit || 0));
    const surplus = roundMoney(Number(stocktake.total_surplus || 0));

    if (deficit <= 0.001 && surplus <= 0.001) return null;

    const lines: JournalLineInput[] = [];

    // في حالة العجز: مدين عجز الجرد (5204) ودائن المخزون (110301)
    if (deficit > 0.001) {
      lines.push({
        account_code: STANDARD_ACCOUNTS.SHORTAGE_EXPENSE,
        debit: deficit,
        credit: 0,
        description: `تسوية عجز جرد مخزني #${stocktake.id}`,
        warehouse_id: stocktake.warehouse_id,
      });
      lines.push({
        account_code: STANDARD_ACCOUNTS.FINISHED_GOODS,
        debit: 0,
        credit: deficit,
        description: `تخفيض المخزون لعجز جرد #${stocktake.id}`,
        warehouse_id: stocktake.warehouse_id,
      });
    }

    // في حالة الفائض: مدين المخزون (110301) ودائن إيرادات متنوعة (4201)
    if (surplus > 0.001) {
      lines.push({
        account_code: STANDARD_ACCOUNTS.FINISHED_GOODS,
        debit: surplus,
        credit: 0,
        description: `إضافة مخزون لفائض جرد #${stocktake.id}`,
        warehouse_id: stocktake.warehouse_id,
      });
      lines.push({
        account_code: STANDARD_ACCOUNTS.OTHER_INCOME,
        debit: 0,
        credit: surplus,
        description: `إثبات أرباح فروقات جرد زائدة #${stocktake.id}`,
        warehouse_id: stocktake.warehouse_id,
      });
    }

    return this.createJournalEntry(
      {
        reference_type: 'stocktake',
        reference_id: stocktake.id,
        idempotency_key: `stocktake_adjustment:${stocktake.id}`,
        description: `إثبات فروقات جرد المخزن #${stocktake.id}`,
        lines,
        created_by: stocktake.user_id,
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
          idempotency_key: `payment:${payment.id}`,
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

  /**
   * ترحيل قيد مصروفات تشغيلية
   */
  async postExpenseJournalEntry(
    client: any,
    expense: {
      id: number;
      expense_number?: string;
      title: string;
      amount: number;
      category_id?: number;
      category_name?: string;
      payment_method?: string;
      is_fixed?: boolean;
      user_id?: number;
      warehouse_id?: number;
      expense_date?: string;
    },
  ) {
    const amount = roundMoney(Number(expense.amount || 0));
    if (amount <= 0) return;

    const method = (expense.payment_method || 'cash').toLowerCase();
    if (method === 'adjustment') {
      // مصاريف التسوية (عجز الجرد) ترحل بقيد مستقل عبر postStocktakeJournalEntry (Dr 5204, Cr 110301)
      return null;
    }

    let debitAccountCode = STANDARD_ACCOUNTS.GENERAL_EXPENSE;
    const title = (expense.title || '').toLowerCase();
    const catName = (expense.category_name || '').toLowerCase();

    if (title.includes('رواتب') || title.includes('مرتب') || catName.includes('رواتب')) {
      debitAccountCode = STANDARD_ACCOUNTS.SALARIES_EXPENSE;
    } else if (
      title.includes('إيجار') ||
      title.includes('ايجار') ||
      title.includes('كهرباء') ||
      title.includes('مياه') ||
      catName.includes('إيجار')
    ) {
      debitAccountCode = STANDARD_ACCOUNTS.RENT_UTILITIES;
    } else if (title.includes('صيانة') || title.includes('تصليح') || catName.includes('صيانة')) {
      debitAccountCode = STANDARD_ACCOUNTS.MAINTENANCE_EXPENSE;
    } else if (title.includes('هدر') || title.includes('تالف') || catName.includes('هدر')) {
      debitAccountCode = STANDARD_ACCOUNTS.WASTE_EXPENSE;
    }

    let creditAccountCode = STANDARD_ACCOUNTS.MAIN_TREASURY;
    if (method === 'card' || method === 'bank') {
      creditAccountCode = STANDARD_ACCOUNTS.BANK_ACCOUNTS;
    } else if (method === 'drawer') {
      creditAccountCode = STANDARD_ACCOUNTS.BRANCH_DRAWER;
    } else if (method === 'wallet' || method === 'instapay') {
      creditAccountCode = STANDARD_ACCOUNTS.E_WALLETS;
    }

    const lines: JournalLineInput[] = [
      {
        account_code: debitAccountCode,
        debit: amount,
        credit: 0,
        description: `إثبات مصروف: ${expense.title}`,
        warehouse_id: expense.warehouse_id,
      },
      {
        account_code: creditAccountCode,
        debit: 0,
        credit: amount,
        description: `سداد مصروف: ${expense.title} (${expense.payment_method || 'نقداً'})`,
        warehouse_id: expense.warehouse_id,
      },
    ];

    return this.createJournalEntry(
      {
        reference_type: 'expense',
        reference_id: expense.id,
        idempotency_key: `expense:${expense.id}`,
        description: `إثبات مصروف ${expense.expense_number || 'EXP-' + expense.id}: ${expense.title}`,
        entry_date: expense.expense_date,
        lines,
        created_by: expense.user_id,
      },
      client,
    );
  },

  /**
   * ترحيل تحصيل دفعة من عميل
   */
  async postCustomerPaymentJournalEntry(
    client: any,
    payment: {
      id: number;
      payment_number?: string;
      customer_id?: number;
      amount: number;
      payment_method?: string;
      notes?: string;
      user_id?: number;
    },
  ) {
    const amount = roundMoney(Number(payment.amount || 0));
    if (amount <= 0) return;

    let debitAccountCode = STANDARD_ACCOUNTS.MAIN_TREASURY;
    const method = (payment.payment_method || 'cash').toLowerCase();
    if (method === 'card' || method === 'bank') {
      debitAccountCode = STANDARD_ACCOUNTS.BANK_ACCOUNTS;
    } else if (method === 'wallet' || method === 'instapay') {
      debitAccountCode = STANDARD_ACCOUNTS.E_WALLETS;
    } else if (method === 'drawer') {
      debitAccountCode = STANDARD_ACCOUNTS.BRANCH_DRAWER;
    }

    const lines: JournalLineInput[] = [
      {
        account_code: debitAccountCode,
        debit: amount,
        credit: 0,
        description: `تحصيل دفعة نقدية من العميل`,
      },
      {
        account_code: STANDARD_ACCOUNTS.CUSTOMERS_RECEIVABLE,
        debit: 0,
        credit: amount,
        description: `سداد من رصيد مديونية العميل`,
      },
    ];

    return this.createJournalEntry(
      {
        reference_type: 'payment',
        reference_id: payment.id,
        idempotency_key: `customer_payment:${payment.id}`,
        description: `تحصيل دفعة عميل ${payment.payment_number || 'PAY-' + payment.id}`,
        lines,
        created_by: payment.user_id,
      },
      client,
    );
  },

  /**
   * ترحيل سداد دفعة لمورد
   */
  async postSupplierPaymentJournalEntry(
    client: any,
    payment: {
      id: number;
      payment_number?: string;
      supplier_id?: number;
      amount: number;
      payment_method?: string;
      notes?: string;
      user_id?: number;
    },
  ) {
    const amount = roundMoney(Number(payment.amount || 0));
    if (amount <= 0) return;

    let creditAccountCode = STANDARD_ACCOUNTS.MAIN_TREASURY;
    const method = (payment.payment_method || 'cash').toLowerCase();
    if (method === 'card' || method === 'bank') {
      creditAccountCode = STANDARD_ACCOUNTS.BANK_ACCOUNTS;
    } else if (method === 'wallet' || method === 'instapay') {
      creditAccountCode = STANDARD_ACCOUNTS.E_WALLETS;
    } else if (method === 'drawer') {
      creditAccountCode = STANDARD_ACCOUNTS.BRANCH_DRAWER;
    }

    const lines: JournalLineInput[] = [
      {
        account_code: STANDARD_ACCOUNTS.SUPPLIERS_PAYABLE,
        debit: amount,
        credit: 0,
        description: `سداد مستحقات للمورد`,
      },
      {
        account_code: creditAccountCode,
        debit: 0,
        credit: amount,
        description: `صرف نقدي لسداد مستحقات مورد (${payment.payment_method || 'نقداً'})`,
      },
    ];

    return this.createJournalEntry(
      {
        reference_type: 'payment',
        reference_id: payment.id,
        idempotency_key: `supplier_payment:${payment.id}`,
        description: `سداد مستحقات مورد ${payment.payment_number || 'PAY-' + payment.id}`,
        lines,
        created_by: payment.user_id,
      },
      client,
    );
  },

  /**
   * ترحيل مسحوبات شريك
   */
  async postPartnerDrawingJournalEntry(
    client: any,
    drawing: {
      id: number;
      voucher_number?: string;
      partner_id: number;
      amount: number;
      source_type?: string;
      payment_method?: string;
      notes?: string;
      user_id?: number;
    },
  ) {
    const amount = roundMoney(Number(drawing.amount || 0));
    if (amount <= 0) return;

    let creditAccountCode = STANDARD_ACCOUNTS.MAIN_TREASURY;
    if (drawing.source_type === 'cash_drawer') {
      creditAccountCode = STANDARD_ACCOUNTS.BRANCH_DRAWER;
    } else if (drawing.payment_method === 'bank') {
      creditAccountCode = STANDARD_ACCOUNTS.BANK_ACCOUNTS;
    }

    const lines: JournalLineInput[] = [
      {
        account_code: STANDARD_ACCOUNTS.PARTNER_DRAWINGS,
        debit: amount,
        credit: 0,
        description: `مسحوبات شريك سند ${drawing.voucher_number || drawing.id}`,
      },
      {
        account_code: creditAccountCode,
        debit: 0,
        credit: amount,
        description: `صرف مسحوبات الشريك نقداً`,
      },
    ];

    return this.createJournalEntry(
      {
        reference_type: 'manual',
        reference_id: drawing.id,
        idempotency_key: `drawing:${drawing.id}`,
        description: `صرف مسحوبات شريك سند ${drawing.voucher_number || drawing.id}`,
        lines,
        created_by: drawing.user_id,
      },
      client,
    );
  },

  /**
   * ترحيل قيد مردودات مبيعات (Sales Refund)
   */
  /**
   * ترحيل قيد مردودات مبيعات (Sales Refund)
   * معالجة كاملة لـ: الإيراد الصافي، الضريبة (إن وجدت)، حساب الدفع/العميل، وتكلفة البضاعة
   */
  async postSalesRefundJournalEntry(
    client: any,
    sale: {
      id: number;
      sale_number: string;
      total_amount: number;
      tax_amount?: number;
      cost_amount?: number;
      sale_type?: string;
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

    let creditAccountCode = STANDARD_ACCOUNTS.BRANCH_DRAWER;
    const method = (sale.payment_method || 'cash').toLowerCase();

    if (sale.customer_id) {
      creditAccountCode = STANDARD_ACCOUNTS.CUSTOMERS_RECEIVABLE;
    } else if (method === 'card' || method === 'bank') {
      creditAccountCode = STANDARD_ACCOUNTS.BANK_ACCOUNTS;
    } else if (method === 'transfer' || method === 'instapay' || method === 'wallet') {
      creditAccountCode = STANDARD_ACCOUNTS.E_WALLETS;
    }

    const lines: JournalLineInput[] = [
      {
        account_code: STANDARD_ACCOUNTS.SALES_RETURNS_ALLOWANCE,
        debit: netRevenue,
        credit: 0,
        description: `إثبات مردودات مبيعات ${sale.sale_number}`,
        warehouse_id: sale.warehouse_id,
      },
    ];

    if (taxAmount > 0) {
      lines.push({
        account_code: STANDARD_ACCOUNTS.VAT_PAYABLE,
        debit: taxAmount,
        credit: 0,
        description: `تخفيض ضريبة مبيعات مرتجعة ${sale.sale_number}`,
        warehouse_id: sale.warehouse_id,
      });
    }

    lines.push({
      account_code: creditAccountCode,
      debit: 0,
      credit: totalAmount,
      description: `رد قيمة مبيعات مرتجعة ${sale.sale_number}`,
      warehouse_id: sale.warehouse_id,
    });

    if (costAmount > 0) {
      const cogsAccount =
        sale.sale_type === 'wholesale'
          ? STANDARD_ACCOUNTS.COGS_WHOLESALE
          : STANDARD_ACCOUNTS.COGS_POS;

      lines.push({
        account_code: STANDARD_ACCOUNTS.FINISHED_GOODS,
        debit: costAmount,
        credit: 0,
        description: `إعادة المخزون السلعي لمرتجع ${sale.sale_number}`,
        warehouse_id: sale.warehouse_id,
      });
      lines.push({
        account_code: cogsAccount,
        debit: 0,
        credit: costAmount,
        description: `تخفيض تكلفة البضاعة المباعة لمرتجع ${sale.sale_number}`,
        warehouse_id: sale.warehouse_id,
      });
    }

    return this.createJournalEntry(
      {
        reference_type: 'sale',
        reference_id: sale.id,
        idempotency_key: `sales_refund:${sale.id}`,
        description: `إثبات قيد مردودات مبيعات ${sale.sale_number}`,
        lines,
        created_by: sale.user_id,
      },
      client,
    );
  },

  /**
   * ترحيل حركات نقدية للوردية (توريد/تغذية)
   */
  async postShiftCashMovementJournalEntry(
    client: any,
    movement: {
      id: number;
      shift_id: number;
      movement_type: 'drop' | 'deposit' | 'expense';
      amount: number;
      reason?: string;
      user_id?: number;
    },
  ) {
    const amount = roundMoney(Number(movement.amount || 0));
    if (amount <= 0) return;

    let lines: JournalLineInput[] = [];

    if (movement.movement_type === 'drop') {
      lines = [
        {
          account_code: STANDARD_ACCOUNTS.MAIN_TREASURY,
          debit: amount,
          credit: 0,
          description: `توريد نقدية من درج الكاشير إلى الخزينة الرئيسية (وردية #${movement.shift_id})`,
        },
        {
          account_code: STANDARD_ACCOUNTS.BRANCH_DRAWER,
          debit: 0,
          credit: amount,
          description: `سحب نقدية من درج الكاشير للتوريد (وردية #${movement.shift_id})`,
        },
      ];
    } else if (movement.movement_type === 'deposit') {
      lines = [
        {
          account_code: STANDARD_ACCOUNTS.BRANCH_DRAWER,
          debit: amount,
          credit: 0,
          description: `إيداع فكة/عهدة في درج الكاشير (وردية #${movement.shift_id})`,
        },
        {
          account_code: STANDARD_ACCOUNTS.MAIN_TREASURY,
          debit: 0,
          credit: amount,
          description: `صرف فكة من الخزينة لدرج الكاشير (وردية #${movement.shift_id})`,
        },
      ];
    } else {
      return;
    }

    return this.createJournalEntry(
      {
        reference_type: 'transfer',
        reference_id: movement.id,
        idempotency_key: `shift_movement:${movement.id}`,
        description: `تحويل نقدية بين الخزينة ودرج الوردية #${movement.shift_id}: ${movement.reason || movement.movement_type}`,
        lines,
        created_by: movement.user_id,
      },
      client,
    );
  },

  /**
   * ترحيل عجز أو زيادة نقدية عند إغلاق الوردية
   */
  async postShiftDifferenceJournalEntry(
    client: any,
    shift: {
      id: number;
      shift_number: string;
      cash_difference: number;
      user_id?: number;
    },
  ) {
    const diff = roundMoney(Number(shift.cash_difference || 0));
    if (Math.abs(diff) <= 0.01) return;

    let lines: JournalLineInput[] = [];

    if (diff < 0) {
      const absDiff = Math.abs(diff);
      lines = [
        {
          account_code: STANDARD_ACCOUNTS.SHORTAGE_EXPENSE,
          debit: absDiff,
          credit: 0,
          description: `إثبات عجز نقدية نهاية الوردية ${shift.shift_number}`,
        },
        {
          account_code: STANDARD_ACCOUNTS.BRANCH_DRAWER,
          debit: 0,
          credit: absDiff,
          description: `تسوية عجز درج الكاشير وردية ${shift.shift_number}`,
        },
      ];
    } else {
      lines = [
        {
          account_code: STANDARD_ACCOUNTS.BRANCH_DRAWER,
          debit: diff,
          credit: 0,
          description: `إثبات زيادة نقدية فعلية في درج الكاشير وردية ${shift.shift_number}`,
        },
        {
          account_code: STANDARD_ACCOUNTS.OTHER_INCOME,
          debit: 0,
          credit: diff,
          description: `إيراد زيادة نقدية تسوية وردية ${shift.shift_number}`,
        },
      ];
    }

    return this.createJournalEntry(
      {
        reference_type: 'manual',
        reference_id: shift.id,
        idempotency_key: `shift_diff:${shift.id}`,
        description: `تسوية فروقات نقدية الوردية ${shift.shift_number} (${diff < 0 ? 'عجز' : 'زيادة'})`,
        lines,
        created_by: shift.user_id,
      },
      client,
    );
  },

  /**
   * ترحيل قيد استحقاق مسير الرواتب عند الاعتماد (Payroll Accrual)
   * مدين: 5201 (الرواتب والأجور والمكافآت)
   * دائن: 210301 (الرواتب والأجور المستحقة)
   */
  async postPayrollAccrualJournalEntry(
    client: any,
    run: {
      id: number;
      period_month: string;
      total_net: number;
      user_id?: number;
    },
  ) {
    const netAmount = roundMoney(Number(run.total_net || 0));
    if (netAmount <= 0) return;

    const monthStr = String(run.period_month).slice(0, 7);
    const lines: JournalLineInput[] = [
      {
        account_code: STANDARD_ACCOUNTS.SALARIES_EXPENSE,
        debit: netAmount,
        credit: 0,
        description: `استحقاق مسير رواتب شهر ${monthStr}`,
      },
      {
        account_code: STANDARD_ACCOUNTS.ACCRUED_PAYROLL,
        debit: 0,
        credit: netAmount,
        description: `مستحقات رواتب العاملين لشهر ${monthStr}`,
      },
    ];

    return this.createJournalEntry(
      {
        reference_type: 'payroll',
        reference_id: run.id,
        idempotency_key: `payroll_accrual:${run.id}`,
        description: `إثبات استحقاق مسير رواتب شهر ${monthStr}`,
        lines,
        created_by: run.user_id,
      },
      client,
    );
  },

  /**
   * ترحيل قيد صرف الرواتب (Payroll Disbursement on Payment)
   * مدين: 210301 (الرواتب والأجور المستحقة)
   * دائن: 110101 (الخزينة) أو 110103 (البنك)
   */
  async postPayrollDisbursementJournalEntry(
    client: any,
    run: {
      id: number;
      period_month: string;
      total_net: number;
      user_id?: number;
    },
    paymentMethod: string = 'cash',
  ) {
    const netAmount = roundMoney(Number(run.total_net || 0));
    if (netAmount <= 0) return;

    const monthStr = String(run.period_month).slice(0, 7);
    const method = (paymentMethod || 'cash').toLowerCase();
    const creditAccount =
      method === 'bank' || method === 'card'
        ? STANDARD_ACCOUNTS.BANK_ACCOUNTS
        : STANDARD_ACCOUNTS.MAIN_TREASURY;

    const lines: JournalLineInput[] = [
      {
        account_code: STANDARD_ACCOUNTS.ACCRUED_PAYROLL,
        debit: netAmount,
        credit: 0,
        description: `صرف مستحقات رواتب شهر ${monthStr}`,
      },
      {
        account_code: creditAccount,
        debit: 0,
        credit: netAmount,
        description: `صرف رواتب شهر ${monthStr} (${paymentMethod})`,
      },
    ];

    return this.createJournalEntry(
      {
        reference_type: 'payroll',
        reference_id: run.id,
        idempotency_key: `payroll_disbursement:${run.id}`,
        description: `إثبات صرف مسير رواتب شهر ${monthStr}`,
        lines,
        created_by: run.user_id,
      },
      client,
    );
  },

  /**
   * عكس قيود مسير الرواتب عند الحذف أو التراجع
   */
  async reversePayrollJournalEntries(client: any, runId: number) {
    const runner = client || query;
    await runner(
      `DELETE FROM journal_entry_lines 
       WHERE journal_entry_id IN (
         SELECT id FROM journal_entries WHERE reference_type = 'payroll' AND reference_id = $1
       )`,
      [runId],
    );
    await runner(
      `DELETE FROM journal_entries WHERE reference_type = 'payroll' AND reference_id = $1`,
      [runId],
    );
  },

  /**
   * عكس قيد يومية مرحل (Journal Reversal)
   * ينشئ قيداً عكسياً متوازناً ويغير حالة القيد الأصلي إلى voided لحفظ سلامة مسار التدقيق
   */
  async reverseJournalEntry(id: number, userId: number, reason?: string) {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      const origRes = await client.query(`SELECT * FROM journal_entries WHERE id = $1 FOR UPDATE`, [
        id,
      ]);
      const original = origRes.rows[0];
      if (!original) throw new AppError('قيد اليومية غير موجود', 404);
      if (original.status === 'voided') {
        throw new AppError('هذا القيد ملغى/معكوس بالفعل', 400);
      }

      const linesRes = await client.query(
        `SELECT * FROM journal_entry_lines WHERE journal_entry_id = $1`,
        [id],
      );
      const lines = linesRes.rows;
      if (lines.length === 0) {
        throw new AppError('لا توجد سطور في القيد المراد عكسه', 400);
      }

      // بناء سطور القيد العكسي بقلب المدين والدائن
      const reversedLines: JournalLineInput[] = lines.map((l) => ({
        account_id: l.account_id,
        debit: Number(l.credit),
        credit: Number(l.debit),
        description: `عكس: ${l.description || original.description}`,
        warehouse_id: l.warehouse_id,
      }));

      const reversalEntry = await this.createJournalEntry(
        {
          reference_type: 'reversal',
          reference_id: original.id,
          idempotency_key: `reversal_${original.id}`,
          description: `قيد عكسي للقيد رقم ${original.entry_number}${reason ? ' — ' + reason : ''}`,
          lines: reversedLines,
          created_by: userId,
        },
        client,
      );

      await client.query(
        `UPDATE journal_entries SET status = 'voided', updated_at = NOW() WHERE id = $1`,
        [id],
      );

      await client.query('COMMIT');
      return {
        id: reversalEntry.id,
        original_entry_id: id,
        reversal_entry: reversalEntry,
        reference_type: 'reversal',
        reference_id: original.id,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  /**
   * حذف قيد يومية مرتبط بمرجع تشغيلي
   */
  async deleteJournalEntryByReference(first: any, second: any, third?: any) {
    let client: any = null;
    let referenceType = '';
    let referenceId = 0;

    if (typeof first === 'string') {
      referenceType = first;
      referenceId = Number(second);
      client = third;
    } else {
      client = first;
      referenceType = String(second);
      referenceId = Number(third);
    }

    const exec = (sql: string, params?: any[]) => {
      if (client?.query) return client.query(sql, params);
      if (typeof client === 'function') return client(sql, params);
      return query(sql, params);
    };

    await exec(
      `DELETE FROM journal_entry_lines 
       WHERE journal_entry_id IN (
         SELECT id FROM journal_entries WHERE reference_type = $1 AND reference_id = $2
       )`,
      [referenceType, referenceId],
    );
    await exec(`DELETE FROM journal_entries WHERE reference_type = $1 AND reference_id = $2`, [
      referenceType,
      referenceId,
    ]);
  },

  /**
   * تحليل أعمار ديون العملاء (Customer Aging)
   */
  async getCustomerAging(asOfDate?: string) {
    const dateStr = asOfDate || new Date().toISOString().slice(0, 10);
    const sql = `
      WITH unpaid_debts AS (
        SELECT 
          c.id AS customer_id,
          c.name_ar AS customer_name,
          c.phone AS customer_phone,
          s.id AS sale_id,
          s.sale_number AS invoice_number,
          s.sale_date AS invoice_date,
          ($1::date - s.sale_date::date) AS age_days,
          s.total_amount - COALESCE((
            SELECT SUM(amount) FROM payments 
            WHERE (reference_type = 'sale' AND reference_id = s.id)
               OR (reference_type = 'invoice' AND reference_id IN (SELECT id FROM invoices WHERE sale_id = s.id))
          ), 0) AS remaining_amount
        FROM sales s
        JOIN customers c ON c.id = s.customer_id
        WHERE s.deleted_at IS NULL 
          AND s.status = 'completed'
          AND s.payment_status != 'paid'
          AND s.sale_date <= $1::date
      )
      SELECT 
        customer_id,
        customer_name,
        customer_phone,
        COUNT(sale_id)::int AS invoices_count,
        COALESCE(SUM(CASE WHEN age_days <= 30 THEN remaining_amount ELSE 0 END), 0) AS current_0_30,
        COALESCE(SUM(CASE WHEN age_days BETWEEN 31 AND 60 THEN remaining_amount ELSE 0 END), 0) AS days_31_60,
        COALESCE(SUM(CASE WHEN age_days BETWEEN 61 AND 90 THEN remaining_amount ELSE 0 END), 0) AS days_61_90,
        COALESCE(SUM(CASE WHEN age_days > 90 THEN remaining_amount ELSE 0 END), 0) AS over_90,
        COALESCE(SUM(remaining_amount), 0) AS total_due
      FROM unpaid_debts
      WHERE remaining_amount > 0.01
      GROUP BY customer_id, customer_name, customer_phone
      ORDER BY total_due DESC
    `;
    const res = await query(sql, [dateStr]);
    const customers = res.rows.map((r: any) => ({
      ...r,
      invoices_count: Number(r.invoices_count),
      current_0_30: roundMoney(Number(r.current_0_30)),
      days_31_60: roundMoney(Number(r.days_31_60)),
      days_61_90: roundMoney(Number(r.days_61_90)),
      over_90: roundMoney(Number(r.over_90)),
      total_due: roundMoney(Number(r.total_due)),
    }));

    const totals = {
      current_0_30: roundMoney(customers.reduce((s: number, c: any) => s + c.current_0_30, 0)),
      days_31_60: roundMoney(customers.reduce((s: number, c: any) => s + c.days_31_60, 0)),
      days_61_90: roundMoney(customers.reduce((s: number, c: any) => s + c.days_61_90, 0)),
      over_90: roundMoney(customers.reduce((s: number, c: any) => s + c.over_90, 0)),
      total_due: roundMoney(customers.reduce((s: number, c: any) => s + c.total_due, 0)),
    };

    return { as_of_date: dateStr, totals, customers };
  },

  /**
   * تحليل أعمار مستحقات الموردين (Supplier Aging)
   */
  async getSupplierAging(asOfDate?: string) {
    const dateStr = asOfDate || new Date().toISOString().slice(0, 10);
    const sql = `
      WITH unpaid_bills AS (
        SELECT 
          s.id AS supplier_id,
          s.name_ar AS supplier_name,
          s.phone AS supplier_phone,
          pi.id AS invoice_id,
          pi.invoice_number,
          pi.invoice_date,
          ($1::date - pi.invoice_date::date) AS age_days,
          pi.total_amount - COALESCE((
            SELECT SUM(total_amount) FROM purchase_returns 
            WHERE purchase_invoice_id = pi.id AND status = 'completed' AND deleted_at IS NULL
          ), 0) - COALESCE((
            SELECT SUM(amount) FROM payments 
            WHERE (reference_type = 'purchase_invoice' AND reference_id = pi.id)
               OR (reference_type = 'supplier' AND reference_id = s.id)
          ), 0) AS remaining_amount
        FROM purchase_invoices pi
        JOIN suppliers s ON s.id = pi.supplier_id
        WHERE pi.deleted_at IS NULL
          AND pi.invoice_date <= $1::date
      )
      SELECT 
        supplier_id,
        supplier_name,
        supplier_phone,
        COUNT(invoice_id)::int AS invoices_count,
        COALESCE(SUM(CASE WHEN age_days <= 30 THEN remaining_amount ELSE 0 END), 0) AS current_0_30,
        COALESCE(SUM(CASE WHEN age_days BETWEEN 31 AND 60 THEN remaining_amount ELSE 0 END), 0) AS days_31_60,
        COALESCE(SUM(CASE WHEN age_days BETWEEN 61 AND 90 THEN remaining_amount ELSE 0 END), 0) AS days_61_90,
        COALESCE(SUM(CASE WHEN age_days > 90 THEN remaining_amount ELSE 0 END), 0) AS over_90,
        COALESCE(SUM(remaining_amount), 0) AS total_due
      FROM unpaid_bills
      WHERE remaining_amount > 0.01
      GROUP BY supplier_id, supplier_name, supplier_phone
      ORDER BY total_due DESC
    `;
    const res = await query(sql, [dateStr]);
    const suppliers = res.rows.map((r: any) => ({
      ...r,
      invoices_count: Number(r.invoices_count),
      current_0_30: roundMoney(Number(r.current_0_30)),
      days_31_60: roundMoney(Number(r.days_31_60)),
      days_61_90: roundMoney(Number(r.days_61_90)),
      over_90: roundMoney(Number(r.over_90)),
      total_due: roundMoney(Number(r.total_due)),
    }));

    const totals = {
      current_0_30: roundMoney(suppliers.reduce((s: number, c: any) => s + c.current_0_30, 0)),
      days_31_60: roundMoney(suppliers.reduce((s: number, c: any) => s + c.days_31_60, 0)),
      days_61_90: roundMoney(suppliers.reduce((s: number, c: any) => s + c.days_61_90, 0)),
      over_90: roundMoney(suppliers.reduce((s: number, c: any) => s + c.over_90, 0)),
      total_due: roundMoney(suppliers.reduce((s: number, c: any) => s + c.total_due, 0)),
    };

    return { as_of_date: dateStr, totals, suppliers };
  },

  /**
   * تقرير مطابقة أرقام العمليات التشغيلية مع الأستاذ العام
   */
  async getLedgerReconciliationSummary(fromDate?: string, toDate?: string) {
    const fDate = fromDate || new Date().toISOString().slice(0, 8) + '01';
    const tDate = toDate || new Date().toISOString().slice(0, 10);

    const glRes = await query(
      `SELECT 
         COALESCE(SUM(CASE WHEN a.code LIKE '4%' THEN jel.credit - jel.debit ELSE 0 END), 0) AS gl_revenue,
         COALESCE(SUM(CASE WHEN a.code LIKE '51%' THEN jel.debit - jel.credit ELSE 0 END), 0) AS gl_cogs,
         COALESCE(SUM(CASE WHEN a.code LIKE '52%' THEN jel.debit - jel.credit ELSE 0 END), 0) AS gl_expenses
       FROM journal_entry_lines jel
       JOIN accounts a ON a.id = jel.account_id
       JOIN journal_entries je ON je.id = jel.journal_entry_id
       WHERE je.status = 'posted'
         AND je.entry_date BETWEEN $1::date AND $2::date`,
      [fDate, tDate],
    );

    const opsSalesRes = await query(
      `SELECT COALESCE(SUM(total_amount), 0) AS ops_revenue,
              COALESCE(SUM(cost_amount), 0) AS ops_cogs
       FROM sales 
       WHERE status = 'completed' AND deleted_at IS NULL
         AND sale_date BETWEEN $1::date AND $2::date`,
      [fDate, tDate],
    );

    const opsExpRes = await query(
      `SELECT COALESCE(SUM(amount), 0) AS ops_expenses
       FROM expenses 
       WHERE deleted_at IS NULL
         AND expense_date BETWEEN $1::date AND $2::date`,
      [fDate, tDate],
    );

    const glRevenue = roundMoney(Number(glRes.rows[0].gl_revenue));
    const glCogs = roundMoney(Number(glRes.rows[0].gl_cogs));
    const glExpenses = roundMoney(Number(glRes.rows[0].gl_expenses));
    const glNetProfit = roundMoney(glRevenue - glCogs - glExpenses);

    const opsRevenue = roundMoney(Number(opsSalesRes.rows[0].ops_revenue));
    const opsCogs = roundMoney(Number(opsSalesRes.rows[0].ops_cogs));
    const opsExpenses = roundMoney(Number(opsExpRes.rows[0].ops_expenses));
    const opsNetProfit = roundMoney(opsRevenue - opsCogs - opsExpenses);

    const revenueDiff = roundMoney(Math.abs(glRevenue - opsRevenue));
    const cogsDiff = roundMoney(Math.abs(glCogs - opsCogs));
    const expensesDiff = roundMoney(Math.abs(glExpenses - opsExpenses));
    const netProfitDiff = roundMoney(Math.abs(glNetProfit - opsNetProfit));

    return {
      period: { from_date: fDate, to_date: tDate },
      general_ledger: {
        revenue: glRevenue,
        cogs: glCogs,
        expenses: glExpenses,
        net_profit: glNetProfit,
      },
      operational: {
        revenue: opsRevenue,
        cogs: opsCogs,
        expenses: opsExpenses,
        net_profit: opsNetProfit,
      },
      variances: {
        revenue: revenueDiff,
        cogs: cogsDiff,
        expenses: expensesDiff,
        net_profit: netProfitDiff,
        is_fully_reconciled: netProfitDiff <= 0.05,
      },
    };
  },

  /**
   * حساب رصيد دفتر الأستاذ لحساب معين حتى تاريخ محدد
   * محصن ضد تسرب قيود المستقبل أو القيود غير المرحلة
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
   * قائمة الدخل الرسمية المباشرة من دفتر الأستاذ العام (Pure GL Income Statement)
   */
  async getIncomeStatement(fromDate?: string, toDate?: string) {
    const fDate = fromDate || new Date().toISOString().slice(0, 8) + '01';
    const tDate = toDate || new Date().toISOString().slice(0, 10);

    const res = await query(
      `SELECT 
         a.id,
         a.code,
         a.name_ar,
         a.account_type,
         COALESCE(SUM(jel.debit), 0) AS total_debit,
         COALESCE(SUM(jel.credit), 0) AS total_credit
       FROM accounts a
       JOIN journal_entry_lines jel ON jel.account_id = a.id
       JOIN journal_entries je ON je.id = jel.journal_entry_id
       WHERE je.status = 'posted'
         AND je.entry_date BETWEEN $1::date AND $2::date
         AND a.account_type IN ('revenue', 'expense')
       GROUP BY a.id, a.code, a.name_ar, a.account_type
       ORDER BY a.code ASC`,
      [fDate, tDate],
    );

    let operatingRevenue = 0;
    let otherIncome = 0;
    let cogs = 0;
    let operatingExpenses = 0;

    const revenueItems: any[] = [];
    const cogsItems: any[] = [];
    const expenseItems: any[] = [];

    for (const r of res.rows) {
      const debit = Number(r.total_debit);
      const credit = Number(r.total_credit);

      if (r.account_type === 'revenue') {
        const net = roundMoney(credit - debit);
        if (r.code.startsWith('41')) {
          operatingRevenue = sumMoney(operatingRevenue, net);
          revenueItems.push({ code: r.code, name: r.name_ar, amount: net });
        } else {
          otherIncome = sumMoney(otherIncome, net);
          revenueItems.push({ code: r.code, name: r.name_ar, amount: net });
        }
      } else if (r.account_type === 'expense') {
        const net = roundMoney(debit - credit);
        if (r.code.startsWith('51')) {
          cogs = sumMoney(cogs, net);
          cogsItems.push({ code: r.code, name: r.name_ar, amount: net });
        } else {
          operatingExpenses = sumMoney(operatingExpenses, net);
          expenseItems.push({ code: r.code, name: r.name_ar, amount: net });
        }
      }
    }

    const totalRevenue = sumMoney(operatingRevenue, otherIncome);
    const grossProfit = roundMoney(operatingRevenue - cogs);
    const grossMargin =
      operatingRevenue > 0 ? roundMoney((grossProfit / operatingRevenue) * 100) : 0;
    const netIncome = roundMoney(grossProfit + otherIncome - operatingExpenses);
    const netMargin = totalRevenue > 0 ? roundMoney((netIncome / totalRevenue) * 100) : 0;

    return {
      period: { from_date: fDate, to_date: tDate },
      operating_revenue: {
        items: revenueItems.filter((i) => i.code.startsWith('41')),
        total: operatingRevenue,
      },
      other_income: {
        items: revenueItems.filter((i) => !i.code.startsWith('41')),
        total: otherIncome,
      },
      total_revenue: totalRevenue,
      cogs: { items: cogsItems, total: cogs },
      gross_profit: grossProfit,
      gross_margin_pct: grossMargin,
      operating_expenses: { items: expenseItems, total: operatingExpenses },
      net_income: netIncome,
      net_margin_pct: netMargin,
    };
  },

  /**
   * مطابقة تقارير الأعمار مع حسابات المراقبة بالأستاذ العام (Subledger vs Control Account)
   */
  async reconcileAgingWithLedger(asOfDate?: string) {
    const dateStr = asOfDate || new Date().toISOString().slice(0, 10);
    const customerAging = await this.getCustomerAging(dateStr);
    const supplierAging = await this.getSupplierAging(dateStr);

    const arAccount = await this.getAccountByCode(STANDARD_ACCOUNTS.CUSTOMERS_RECEIVABLE);
    const apAccount = await this.getAccountByCode(STANDARD_ACCOUNTS.SUPPLIERS_PAYABLE);

    const arGlBalance = arAccount ? await this.getLedgerBalanceAsOfDate(arAccount.id, dateStr) : 0;
    const apGlBalance = apAccount ? await this.getLedgerBalanceAsOfDate(apAccount.id, dateStr) : 0;

    const arTotalDue = customerAging.totals.total_due;
    const apTotalDue = supplierAging.totals.total_due;

    const arVariance = roundMoney(Math.abs(arTotalDue - arGlBalance));
    const apVariance = roundMoney(Math.abs(apTotalDue - apGlBalance));

    const arSide = {
      control_account_code: STANDARD_ACCOUNTS.CUSTOMERS_RECEIVABLE,
      gl_balance: arGlBalance,
      control_account_balance: arGlBalance,
      subledger_total: arTotalDue,
      variance: arVariance,
      is_reconciled: arVariance <= 0.05,
    };

    const apSide = {
      control_account_code: STANDARD_ACCOUNTS.SUPPLIERS_PAYABLE,
      gl_balance: apGlBalance,
      control_account_balance: apGlBalance,
      subledger_total: apTotalDue,
      variance: apVariance,
      is_reconciled: apVariance <= 0.05,
    };

    const isReconciled = arVariance <= 0.05 && apVariance <= 0.05;

    return {
      as_of_date: dateStr,
      accounts_receivable: arSide,
      accounts_payable: apSide,
      customers: arSide,
      suppliers: apSide,
      is_fully_reconciled: isReconciled,
      is_all_reconciled: isReconciled,
    };
  },
};
