/**
 * routes/accounting.routes.ts — مسارات النظام المحاسبي ودفتر الأستاذ العام
 */

import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.ts';
import { validateBody } from '../middleware/validate.ts';
import { accountingController } from '../controllers/accountingController.ts';
import { purchaseReturnController } from '../controllers/purchaseReturnController.ts';
import { purchaseOrderController } from '../controllers/purchaseOrderController.ts';
import { upload } from './helpers.ts';
import { createAccountSchema, updateAccountSchema, createJournalEntrySchema } from './schemas.ts';

const router = Router();

// ─── 1. دليل الحسابات (Chart of Accounts) ──────────────────────────────────────
router.get(
  '/accounting/accounts',
  authenticate,
  authorize('accounting.view', 'settings.view', 'reports.view'),
  accountingController.getAccounts,
);

router.get(
  '/accounting/accounts/:id',
  authenticate,
  authorize('accounting.view', 'settings.view'),
  accountingController.getAccountById,
);

router.post(
  '/accounting/accounts',
  authenticate,
  authorize('accounting.manage', 'settings.edit'),
  validateBody(createAccountSchema),
  accountingController.createAccount,
);

router.put(
  '/accounting/accounts/:id',
  authenticate,
  authorize('accounting.manage', 'settings.edit'),
  validateBody(updateAccountSchema),
  accountingController.updateAccount,
);

// ─── 2. قيود اليومية (Journal Entries) ──────────────────────────────────────────
router.post(
  '/accounting/journal-entries',
  authenticate,
  authorize('accounting.manage'),
  validateBody(createJournalEntrySchema),
  accountingController.createJournalEntry,
);

router.post(
  '/accounting/journal-entries/:id/reverse',
  authenticate,
  authorize('accounting.manage'),
  accountingController.reverseJournalEntry,
);

// ─── 3. القوائم والتقارير المالية الدفترية (General Ledger, Trial Balance, BS, P&L) ──
router.get(
  '/accounting/general-ledger',
  authenticate,
  authorize('accounting.view', 'reports.view'),
  accountingController.getGeneralLedger,
);

router.get(
  '/accounting/trial-balance',
  authenticate,
  authorize('accounting.view', 'reports.view'),
  accountingController.getTrialBalance,
);

router.get(
  '/accounting/balance-sheet',
  authenticate,
  authorize('accounting.view', 'reports.view'),
  accountingController.getBalanceSheet,
);

router.get(
  '/accounting/income-statement',
  authenticate,
  authorize('accounting.view', 'reports.view'),
  accountingController.getIncomeStatement,
);

// ─── 4. مرتجعات المشتريات (Purchase Returns) ──────────────────────────────────
router.get(
  ['/purchases/returns', '/accounting/purchase-returns'],
  authenticate,
  authorize('purchase_returns.view', 'inventory.view', 'expenses.view'),
  purchaseReturnController.getPurchaseReturns,
);

router.get(
  ['/purchases/returns/:id', '/accounting/purchase-returns/:id'],
  authenticate,
  authorize('purchase_returns.view', 'inventory.view', 'expenses.view'),
  purchaseReturnController.getPurchaseReturnById,
);

router.post(
  ['/purchases/returns', '/accounting/purchase-returns'],
  authenticate,
  authorize('purchase_returns.create', 'inventory.edit'),
  purchaseReturnController.createPurchaseReturn,
);

// ─── 5. تحليل أعمار الديون والمديونيات (Aging Analysis) ───────────────────────
router.get(
  '/accounting/aging/customers',
  authenticate,
  authorize('accounting.view', 'reports.view', 'customers.view'),
  accountingController.getCustomerAging,
);

router.get(
  '/accounting/aging/suppliers',
  authenticate,
  authorize('accounting.view', 'reports.view', 'suppliers.view'),
  accountingController.getSupplierAging,
);

router.get(
  '/accounting/aging/reconciliation',
  authenticate,
  authorize('accounting.view', 'reports.view'),
  accountingController.reconcileAgingWithLedger,
);

// ─── 6. مطابقة أرقام العمليات مع الأستاذ العام (P&L Ledger Reconciliation) ───
router.get(
  '/accounting/ledger-reconciliation',
  authenticate,
  authorize('accounting.view', 'reports.view'),
  accountingController.getLedgerReconciliationSummary,
);

// ─── 7. مطابقة وتسوية الحسابات البنكية والخزينة (Bank Reconciliation) ────────
router.get(
  '/accounting/reconciliations',
  authenticate,
  authorize('reconciliation.view', 'accounting.view'),
  accountingController.getReconciliations,
);

router.get(
  '/accounting/reconciliations/:id',
  authenticate,
  authorize('reconciliation.view', 'accounting.view'),
  accountingController.getReconciliationById,
);

router.post(
  '/accounting/reconciliations',
  authenticate,
  authorize('reconciliation.manage', 'accounting.manage'),
  accountingController.createReconciliation,
);

router.post(
  '/accounting/reconciliations/:id/import-statement',
  authenticate,
  authorize('reconciliation.manage', 'accounting.manage'),
  upload.single('file'),
  accountingController.importStatement,
);

router.get(
  '/accounting/reconciliations/:id/transactions',
  authenticate,
  authorize('reconciliation.view', 'accounting.view'),
  accountingController.getStatementTransactions,
);

router.post(
  '/accounting/reconciliations/:id/auto-match',
  authenticate,
  authorize('reconciliation.manage', 'accounting.manage'),
  accountingController.autoMatchTransactions,
);

router.post(
  '/accounting/reconciliations/transactions/:txId/match',
  authenticate,
  authorize('reconciliation.manage', 'accounting.manage'),
  accountingController.matchTransaction,
);

router.post(
  '/accounting/reconciliations/transactions/:txId/unmatch',
  authenticate,
  authorize('reconciliation.manage', 'accounting.manage'),
  accountingController.unmatchTransaction,
);

router.post(
  '/accounting/reconciliations/transactions/:txId/exclude',
  authenticate,
  authorize('reconciliation.manage', 'accounting.manage'),
  accountingController.excludeTransaction,
);

router.post(
  '/accounting/reconciliations/:id/finalize',
  authenticate,
  authorize('reconciliation.manage', 'accounting.manage'),
  accountingController.finalizeReconciliation,
);

// ─── 8. دورة أوامر الشراء والاستلام (Purchase Orders) ─────────────────────────
router.get(
  ['/purchases/orders', '/accounting/purchase-orders'],
  authenticate,
  authorize('purchase_orders.view', 'purchases.view', 'inventory.view'),
  purchaseOrderController.listPurchaseOrders,
);

router.get(
  ['/purchases/orders/:id', '/accounting/purchase-orders/:id'],
  authenticate,
  authorize('purchase_orders.view', 'purchases.view', 'inventory.view'),
  purchaseOrderController.getPurchaseOrderById,
);

router.post(
  ['/purchases/orders', '/accounting/purchase-orders'],
  authenticate,
  authorize('purchase_orders.manage', 'purchases.create'),
  purchaseOrderController.createPurchaseOrder,
);

router.post(
  ['/purchases/orders/:id/approve', '/accounting/purchase-orders/:id/approve'],
  authenticate,
  authorize('purchase_orders.manage', 'purchases.create'),
  purchaseOrderController.approvePurchaseOrder,
);

router.post(
  ['/purchases/orders/:id/receive', '/accounting/purchase-orders/:id/receive'],
  authenticate,
  authorize('purchase_orders.manage', 'inventory.edit'),
  purchaseOrderController.receiveGoods,
);

router.post(
  ['/purchases/orders/:id/cancel', '/accounting/purchase-orders/:id/cancel'],
  authenticate,
  authorize('purchase_orders.manage', 'purchases.create'),
  purchaseOrderController.cancelPurchaseOrder,
);

// ─── 9. الفترات والإقفال المالي (Financial Periods) ─────────────────────────
router.get(
  '/accounting/periods',
  authenticate,
  authorize('accounting.view', 'settings.view'),
  accountingController.listPeriods,
);

router.post(
  '/accounting/periods',
  authenticate,
  authorize('accounting.period_close', 'accounting.manage', 'settings.edit'),
  accountingController.createPeriod,
);

router.get(
  '/accounting/periods/:id',
  authenticate,
  authorize('accounting.view', 'settings.view'),
  accountingController.getPeriodById,
);

router.get(
  '/accounting/periods/:id/checklist',
  authenticate,
  authorize('accounting.view', 'settings.view'),
  accountingController.getPeriodChecklist,
);

router.post(
  '/accounting/periods/:id/close',
  authenticate,
  authorize('accounting.period_close', 'accounting.manage'),
  accountingController.closePeriod,
);

router.post(
  '/accounting/periods/:id/reopen',
  authenticate,
  authorize('accounting.period_reopen', 'accounting.manage'),
  accountingController.reopenPeriod,
);

export default router;
