/**
 * routes/accounting.routes.ts — مسارات النظام المحاسبي ودفتر الأستاذ العام
 */

import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.ts';
import { accountingController } from '../controllers/accountingController.ts';
import { purchaseReturnController } from '../controllers/purchaseReturnController.ts';
import { purchaseOrderController } from '../controllers/purchaseOrderController.ts';

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
  accountingController.createAccount,
);

router.put(
  '/accounting/accounts/:id',
  authenticate,
  authorize('accounting.manage', 'settings.edit'),
  accountingController.updateAccount,
);

// ─── 2. قيود اليومية (Journal Entries) ──────────────────────────────────────────
router.post(
  '/accounting/journal-entries',
  authenticate,
  authorize('accounting.manage'),
  accountingController.createJournalEntry,
);

// ─── 3. القوائم والتقارير المالية الدفترية (General Ledger, Trial Balance, BS) ──
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

export default router;
