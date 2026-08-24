import * as partnerService from '../services/partnerService.ts';
import { ok } from './helper.ts';
import { AppError } from '../types/errors.ts';

export const partnersController = {
  /**
   * قائمة الشركاء
   */
  listPartners: async (req: any, res: any, next: any) => {
    try {
      ok(res, await partnerService.getPartners());
    } catch (e: any) {
      next(e);
    }
  },

  /**
   * تفاصيل شريك محدد
   */
  getPartner: async (req: any, res: any, next: any) => {
    try {
      const id = Number(req.params.id);
      if (!id) throw new AppError('معرف الشريك غير صالح', 400);
      ok(res, await partnerService.getPartnerById(id));
    } catch (e: any) {
      next(e);
    }
  },

  /**
   * إضافة شريك
   */
  createPartner: async (req: any, res: any, next: any) => {
    try {
      ok(res, await partnerService.createPartner(req.body));
    } catch (e: any) {
      next(e);
    }
  },

  /**
   * تعديل شريك
   */
  updatePartner: async (req: any, res: any, next: any) => {
    try {
      const id = Number(req.params.id);
      if (!id) throw new AppError('معرف الشريك غير صالح', 400);
      ok(res, await partnerService.updatePartner(id, req.body));
    } catch (e: any) {
      next(e);
    }
  },

  /**
   * حذف شريك
   */
  deletePartner: async (req: any, res: any, next: any) => {
    try {
      const id = Number(req.params.id);
      if (!id) throw new AppError('معرف الشريك غير صالح', 400);
      ok(res, await partnerService.deletePartner(id));
    } catch (e: any) {
      next(e);
    }
  },

  /**
   * قائمة سندات مسحوبات الشركاء
   */
  listDrawings: async (req: any, res: any, next: any) => {
    try {
      const filters = {
        partner_id: req.query.partner_id ? Number(req.query.partner_id) : undefined,
        from_date: req.query.from_date as string | undefined,
        to_date: req.query.to_date as string | undefined,
        warehouse_id: req.query.warehouse_id ? Number(req.query.warehouse_id) : undefined,
        source_type: req.query.source_type as string | undefined,
      };
      ok(res, await partnerService.getPartnerDrawings(filters));
    } catch (e: any) {
      next(e);
    }
  },

  /**
   * تسجيل سند مسحوبات شريك
   */
  createDrawing: async (req: any, res: any, next: any) => {
    try {
      const userId = req.user?.id || null;
      ok(res, await partnerService.createPartnerDrawing(req.body, userId));
    } catch (e: any) {
      next(e);
    }
  },

  /**
   * حذف سند مسحوبات
   */
  deleteDrawing: async (req: any, res: any, next: any) => {
    try {
      const id = Number(req.params.id);
      if (!id) throw new AppError('معرف سند المسحوبات غير صالح', 400);
      ok(res, await partnerService.deletePartnerDrawing(id));
    } catch (e: any) {
      next(e);
    }
  },

  /**
   * تسوية الأرباح التلقائية للفترة
   */
  settlement: async (req: any, res: any, next: any) => {
    try {
      const { from_date, to_date } = req.query;
      if (!from_date || !to_date) {
        throw new AppError('from_date و to_date مطلوبان لحساب التسوية', 400);
      }
      ok(res, await partnerService.getProfitSettlement(from_date as string, to_date as string));
    } catch (e: any) {
      next(e);
    }
  },
};
