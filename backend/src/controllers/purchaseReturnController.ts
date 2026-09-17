/**
 * purchaseReturnController.ts — وحدة التحكم في مرتجعات المشتريات (Debit Notes)
 */

import type { Request, Response } from 'express';
import { purchaseReturnService } from '../services/purchaseReturnService.ts';
import { ok, wrap } from './helper.ts';
import { AppError } from '../types/errors.ts';

export const purchaseReturnController = {
  getPurchaseReturns: wrap(async (req: Request, res: Response) => {
    const filters = {
      supplier_id: req.query.supplier_id ? Number(req.query.supplier_id) : undefined,
      purchase_invoice_id: req.query.purchase_invoice_id
        ? Number(req.query.purchase_invoice_id)
        : undefined,
      warehouse_id: req.query.warehouse_id ? Number(req.query.warehouse_id) : undefined,
      from_date: req.query.from_date as string | undefined,
      to_date: req.query.to_date as string | undefined,
      limit: req.query.limit ? Number(req.query.limit) : 50,
      offset: req.query.offset ? Number(req.query.offset) : 0,
    };
    const returns = await purchaseReturnService.getPurchaseReturns(filters);
    ok(res, returns);
  }),

  getPurchaseReturnById: wrap(async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!id) throw new AppError('معرف المرتجع غير صحيح', 400);
    const ret = await purchaseReturnService.getPurchaseReturnById(id);
    ok(res, ret);
  }),

  createPurchaseReturn: wrap(async (req: Request, res: Response) => {
    const userId = (req as any).user?.id || (req as any).user?.userId;
    const ret = await purchaseReturnService.createPurchaseReturn(userId, req.body);
    ok(res, ret, 'تم تسجيل مرتجع المشتريات وتسوية الرصيد والمخزون بنجاح');
  }),
};
