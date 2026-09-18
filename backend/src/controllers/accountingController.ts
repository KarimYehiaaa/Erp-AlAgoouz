/**
 * accountingController.ts — وحدة التحكم في النظام المحاسبي والأستاذ العام
 */

import type { Request, Response } from 'express';
import { accountingService } from '../services/accountingService.ts';
import { bankReconciliationService } from '../services/bankReconciliationService.ts';
import { ok, wrap } from './helper.ts';
import { AppError } from '../types/errors.ts';

export const accountingController = {
  getAccounts: wrap(async (req: Request, res: Response) => {
    const filters = {
      account_type: req.query.account_type as string | undefined,
      is_active: req.query.is_active !== undefined ? req.query.is_active === 'true' : undefined,
      parent_id: req.query.parent_id ? Number(req.query.parent_id) : undefined,
    };
    const accounts = await accountingService.getAccounts(filters);
    ok(res, accounts);
  }),

  getAccountById: wrap(async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!id) throw new AppError('معرف الحساب غير صحيح', 400);
    const account = await accountingService.getAccountById(id);
    if (!account) throw new AppError('الحساب غير موجود', 404);
    ok(res, account);
  }),

  createAccount: wrap(async (req: Request, res: Response) => {
    const created = await accountingService.createAccount(req.body);
    ok(res, created, 'تم إنشاء الحساب بنجاح', void 0);
  }),

  updateAccount: wrap(async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!id) throw new AppError('معرف الحساب غير صحيح', 400);
    const updated = await accountingService.updateAccount(id, req.body);
    ok(res, updated, 'تم تحديث الحساب بنجاح');
  }),

  createJournalEntry: wrap(async (req: Request, res: Response) => {
    const userId = (req as any).user?.id || (req as any).user?.userId;
    const entry = await accountingService.createJournalEntry({
      ...req.body,
      created_by: userId,
    });
    ok(res, entry, 'تم تسجيل وترحيل قيد اليومية بنجاح');
  }),

  getGeneralLedger: wrap(async (req: Request, res: Response) => {
    const params = {
      account_id: req.query.account_id ? Number(req.query.account_id) : undefined,
      account_code: req.query.account_code as string | undefined,
      from_date: req.query.from_date as string | undefined,
      to_date: req.query.to_date as string | undefined,
      warehouse_id: req.query.warehouse_id ? Number(req.query.warehouse_id) : undefined,
    };
    const gl = await accountingService.getGeneralLedger(params);
    ok(res, gl);
  }),

  getTrialBalance: wrap(async (req: Request, res: Response) => {
    const params = {
      from_date: req.query.from_date as string | undefined,
      to_date: req.query.to_date as string | undefined,
    };
    const tb = await accountingService.getTrialBalance(params);
    ok(res, tb);
  }),

  getBalanceSheet: wrap(async (req: Request, res: Response) => {
    const asOfDate = req.query.as_of_date as string | undefined;
    const bs = await accountingService.getBalanceSheet(asOfDate);
    ok(res, bs);
  }),

  getCustomerAging: wrap(async (req: Request, res: Response) => {
    const asOfDate = req.query.as_of_date as string | undefined;
    const aging = await accountingService.getCustomerAging(asOfDate);
    ok(res, aging);
  }),

  getSupplierAging: wrap(async (req: Request, res: Response) => {
    const asOfDate = req.query.as_of_date as string | undefined;
    const aging = await accountingService.getSupplierAging(asOfDate);
    ok(res, aging);
  }),

  reconcileAgingWithLedger: wrap(async (req: Request, res: Response) => {
    const asOfDate = req.query.as_of_date as string | undefined;
    const rec = await accountingService.reconcileAgingWithLedger(asOfDate);
    ok(res, rec);
  }),

  getIncomeStatement: wrap(async (req: Request, res: Response) => {
    const fromDate = req.query.from_date as string | undefined;
    const toDate = req.query.to_date as string | undefined;
    const statement = await accountingService.getIncomeStatement(fromDate, toDate);
    ok(res, statement);
  }),

  reverseJournalEntry: wrap(async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!id) throw new AppError('معرف قيد اليومية غير صحيح', 400);
    const userId = (req as any).user?.id || (req as any).user?.userId;
    const reversed = await accountingService.reverseJournalEntry(id, userId, req.body?.reason);
    ok(res, reversed, 'تم عكس قيد اليومية بنجاح');
  }),

  getLedgerReconciliationSummary: wrap(async (req: Request, res: Response) => {
    const fromDate = req.query.from_date as string | undefined;
    const toDate = req.query.to_date as string | undefined;
    const summary = await accountingService.getLedgerReconciliationSummary(fromDate, toDate);
    ok(res, summary);
  }),

  // ─── مطابقة البنك وكشف الحساب التفصيلي ─────────────────────────────────────
  getReconciliations: wrap(async (req: Request, res: Response) => {
    const filters = {
      account_id: req.query.account_id ? Number(req.query.account_id) : undefined,
      from_date: req.query.from_date as string | undefined,
      to_date: req.query.to_date as string | undefined,
      status: req.query.status as string | undefined,
    };
    const recs = await bankReconciliationService.getReconciliations(filters);
    ok(res, recs);
  }),

  getReconciliationById: wrap(async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!id) throw new AppError('معرف المطابقة غير صحيح', 400);
    const rec = await bankReconciliationService.getReconciliationById(id);
    ok(res, rec);
  }),

  createReconciliation: wrap(async (req: Request, res: Response) => {
    const userId = (req as any).user?.id || (req as any).user?.userId;
    const rec = await bankReconciliationService.createReconciliation(userId, req.body);
    ok(res, rec, 'تم حفظ وتسجيل جلسة المطابقة بنجاح', void 0);
  }),

  importStatement: wrap(async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!id) throw new AppError('معرف جلسة المطابقة مطلوب', 400);
    const file = (req as any).file;
    if (!file || !file.buffer) {
      throw new AppError('يرجى رفع ملف كشف الحساب البنكي (CSV أو Excel)', 400);
    }
    const result = await bankReconciliationService.importBankStatement(
      id,
      file.buffer,
      file.originalname,
    );
    ok(res, result, `تم استيراد ${result.imported_count} حركة بنكية بنجاح`);
  }),

  getStatementTransactions: wrap(async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!id) throw new AppError('معرف جلسة المطابقة مطلوب', 400);
    const txs = await bankReconciliationService.getStatementTransactions(id, {
      status: req.query.status as string | undefined,
    });
    ok(res, txs);
  }),

  autoMatchTransactions: wrap(async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!id) throw new AppError('معرف جلسة المطابقة مطلوب', 400);
    const result = await bankReconciliationService.autoMatchTransactions(id);
    ok(res, result, `اكتملت المطابقة الآلية: تمت مطابقة ${result.matched_count} حركة`);
  }),

  matchTransaction: wrap(async (req: Request, res: Response) => {
    const txId = Number(req.params.txId);
    if (!txId) throw new AppError('معرف حركة كشف الحساب مطلوب', 400);
    const matched = await bankReconciliationService.matchTransaction(txId, req.body);
    ok(res, matched, 'تمت مطابقة الحركة بنجاح');
  }),

  unmatchTransaction: wrap(async (req: Request, res: Response) => {
    const txId = Number(req.params.txId);
    if (!txId) throw new AppError('معرف حركة كشف الحساب مطلوب', 400);
    const unmatched = await bankReconciliationService.unmatchTransaction(txId);
    ok(res, unmatched, 'تم إلغاء مطابقة الحركة');
  }),

  excludeTransaction: wrap(async (req: Request, res: Response) => {
    const txId = Number(req.params.txId);
    if (!txId) throw new AppError('معرف حركة كشف الحساب مطلوب', 400);
    const excluded = await bankReconciliationService.excludeTransaction(txId, req.body?.reason);
    ok(res, excluded, 'تم استبعاد الحركة من المطابقة');
  }),

  finalizeReconciliation: wrap(async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!id) throw new AppError('معرف جلسة المطابقة مطلوب', 400);
    const userId = (req as any).user?.id || (req as any).user?.userId;
    const finalized = await bankReconciliationService.finalizeReconciliation(id, userId);
    ok(res, finalized, 'تم اعتماد وإغلاق جلسة المطابقة بنجاح');
  }),

  // ─── الفترات المحاسبية (Financial Periods) ─────────────────────────────────
  listPeriods: wrap(async (req: Request, res: Response) => {
    const { financialPeriodService } = await import('../services/financialPeriodService.ts');
    const periods = await financialPeriodService.listPeriods({
      status: req.query.status as string | undefined,
    });
    ok(res, periods);
  }),

  getPeriodById: wrap(async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!id) throw new AppError('معرف الفترة غير صحيح', 400);
    const { financialPeriodService } = await import('../services/financialPeriodService.ts');
    const period = await financialPeriodService.getPeriodById(id);
    ok(res, period);
  }),

  createPeriod: wrap(async (req: Request, res: Response) => {
    const userId = (req as any).user?.id || (req as any).user?.userId;
    const { financialPeriodService } = await import('../services/financialPeriodService.ts');
    const period = await financialPeriodService.createPeriod(userId, req.body);
    ok(res, period, 'تم إنشاء الفترة المحاسبية بنجاح');
  }),

  getPeriodChecklist: wrap(async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!id) throw new AppError('معرف الفترة غير صحيح', 400);
    const { financialPeriodService } = await import('../services/financialPeriodService.ts');
    const checklist = await financialPeriodService.getCloseChecklist(id);
    ok(res, checklist);
  }),

  closePeriod: wrap(async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!id) throw new AppError('معرف الفترة غير صحيح', 400);
    const userId = (req as any).user?.id || (req as any).user?.userId;
    const { financialPeriodService } = await import('../services/financialPeriodService.ts');
    const closed = await financialPeriodService.closePeriod(id, userId, req.body);
    ok(res, closed, 'تم إقفال الفترة المحاسبية بنجاح');
  }),

  reopenPeriod: wrap(async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!id) throw new AppError('معرف الفترة غير صحيح', 400);
    const userId = (req as any).user?.id || (req as any).user?.userId;
    const { financialPeriodService } = await import('../services/financialPeriodService.ts');
    const reopened = await financialPeriodService.reopenPeriod(id, userId, req.body?.reason);
    ok(res, reopened, 'تم إعادة فتح الفترة المحاسبية بنجاح');
  }),
};
