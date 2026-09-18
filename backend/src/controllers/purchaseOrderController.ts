/**
 * purchaseOrderController.ts — وحدة التحكم في أوامر الشراء والاستلام
 */

import type { Request, Response } from 'express';
import { purchaseOrderService } from '../services/purchaseOrderService.ts';
import { ok, wrap } from './helper.ts';
import { AppError } from '../types/errors.ts';

export const purchaseOrderController = {
  listPurchaseOrders: wrap(async (req: Request, res: Response) => {
    const filters = {
      status: req.query.status as string | undefined,
      supplier_id: req.query.supplier_id ? Number(req.query.supplier_id) : undefined,
      warehouse_id: req.query.warehouse_id ? Number(req.query.warehouse_id) : undefined,
      from_date: req.query.from_date as string | undefined,
      to_date: req.query.to_date as string | undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    };
    const orders = await purchaseOrderService.listPurchaseOrders(filters);
    ok(res, orders);
  }),

  getPurchaseOrderById: wrap(async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!id) throw new AppError('معرف أمر الشراء غير صحيح', 400);
    const order = await purchaseOrderService.getPurchaseOrderById(id);
    ok(res, order);
  }),

  createPurchaseOrder: wrap(async (req: Request, res: Response) => {
    const userId = (req as any).user?.id || (req as any).user?.userId;
    const order = await purchaseOrderService.createPurchaseOrder(userId, req.body);
    ok(res, order, 'تم إنشاء أمر الشراء بنجاح', void 0);
  }),

  approvePurchaseOrder: wrap(async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!id) throw new AppError('معرف أمر الشراء غير صحيح', 400);
    const userId = (req as any).user?.id || (req as any).user?.userId;
    const order = await purchaseOrderService.approvePurchaseOrder(id, userId);
    ok(res, order, 'تم اعتماد أمر الشراء بنجاح');
  }),

  receiveGoods: wrap(async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!id) throw new AppError('معرف أمر الشراء غير صحيح', 400);
    const userId = (req as any).user?.id || (req as any).user?.userId;
    const result = await purchaseOrderService.receiveGoods(id, userId, req.body);
    ok(res, result, 'تم تسجيل استلام البضاعة بنجاح');
  }),

  cancelPurchaseOrder: wrap(async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!id) throw new AppError('معرف أمر الشراء غير صحيح', 400);
    const userId = (req as any).user?.id || (req as any).user?.userId;
    const result = await purchaseOrderService.cancelPurchaseOrder(id, userId);
    ok(res, result, 'تم إلغاء أمر الشراء بنجاح');
  }),
};
