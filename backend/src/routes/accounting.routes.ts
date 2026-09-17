/**
 * routes/accounting.routes.ts — مسارات النظام المحاسبي ودفتر الأستاذ العام
 */

import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.ts';
import { accountingController } from '../controllers/accountingController.ts';
import { purchaseReturnController } from '../controllers/purchaseReturnController.ts';

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

export default router;
