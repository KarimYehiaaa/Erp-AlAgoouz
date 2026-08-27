import * as partnerService from '../services/partnerService.ts';
import { ok, wrap } from './helper.ts';
import { AppError } from '../types/errors.ts';

export const partnersController = {
  /**
   * قائمة الشركاء
   */
  listPartners: wrap(async (req: any, res: any, next: any) => {
    ok(res, await partnerService.getPartners());
  }),

  /**
   * تفاصيل شريك محدد
   */
  getPartner: wrap(async (req: any, res: any, next: any) => {
    const id = Number(req.params.id);
    if (!id) throw new AppError('معرف الشريك غير صالح', 400);
    ok(res, await partnerService.getPartnerById(id));
  }),

  /**
   * إضافة شريك
   */
  createPartner: wrap(async (req: any, res: any, next: any) => {
    ok(res, await partnerService.createPartner(req.body));
  }),

  /**
   * تعديل شريك
   */
  updatePartner: wrap(async (req: any, res: any, next: any) => {
    const id = Number(req.params.id);
    if (!id) throw new AppError('معرف الشريك غير صالح', 400);
    ok(res, await partnerService.updatePartner(id, req.body));
  }),

  /**
   * حذف شريك
   */
  deletePartner: wrap(async (req: any, res: any, next: any) => {
    const id = Number(req.params.id);
    if (!id) throw new AppError('معرف الشريك غير صالح', 400);
    ok(res, await partnerService.deletePartner(id));
  }),

  /**
   * قائمة سندات مسحوبات الشركاء
   */
  listDrawings: wrap(async (req: any, res: any, next: any) => {
    const filters = {
      partner_id: req.query.partner_id ? Number(req.query.partner_id) : undefined,
      from_date: req.query.from_date as string | undefined,
      to_date: req.query.to_date as string | undefined,
      warehouse_id: req.query.warehouse_id ? Number(req.query.warehouse_id) : undefined,
      source_type: req.query.source_type as string | undefined,
    };
    ok(res, await partnerService.getPartnerDrawings(filters));
  }),

  /**
   * تسجيل سند مسحوبات شريك
   */
  createDrawing: wrap(async (req: any, res: any, next: any) => {
    const userId = req.user?.id || null;
    ok(res, await partnerService.createPartnerDrawing(req.body, userId));
  }),

  /**
   * حذف سند مسحوبات
   */
  deleteDrawing: wrap(async (req: any, res: any, next: any) => {
    const id = Number(req.params.id);
    if (!id) throw new AppError('معرف سند المسحوبات غير صالح', 400);
    ok(res, await partnerService.deletePartnerDrawing(id));
  }),

  /**
   * تسوية الأرباح التلقائية للفترة
   */
  settlement: wrap(async (req: any, res: any, next: any) => {
    const { from_date, to_date } = req.query;
    if (!from_date || !to_date) {
      throw new AppError('from_date و to_date مطلوبان لحساب التسوية', 400);
    }
    ok(res, await partnerService.getProfitSettlement(from_date as string, to_date as string));
  }),
};
