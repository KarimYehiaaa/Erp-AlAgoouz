/**
 * routes/helpers.ts — أدوات مشتركة لوحدات التوجيه
 * ════════════════════════════════════════════
 * عناصر يتشاركها أكثر من ملف مسارات:
 *  - `upload` — multer لرفع الملفات (Excel/استعادة)
 *  - `requireAdmin` — حارس يسمح للمدير فقط (role_name = 'admin')
 */
import multer from 'multer';
import type { Request, Response, NextFunction } from 'express';

/** رافع الملفات الموحّد — ذاكرة فقط، حد أقصى 5MB. */
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

/**
 * Middleware يمنع الوصول إلا لأدوار admin حصرًا (بغض النظر عن الصلاحيات).
 * يُستخدم لعمليات النسخ الاحتياطي والاستعادة والعمليات الإدارية الحساسة.
 * @param {Request} req طلب HTTP (يُتوقع أن authenticate سبقته)
 * @param {Response} res استجابة HTTP
 * @param {NextFunction} next تمرير التحكم
 * @returns {Response | void} 403 إن لم يكن admin، وإلا متابعة
 */
export const requireAdmin = (req: Request, res: Response, next: NextFunction): Response | void => {
  if (req.user?.role_name !== 'admin') {
    return res.status(403).json({ success: false, message: 'هذه العملية متاحة للمدير فقط' });
  }
  next();
};
