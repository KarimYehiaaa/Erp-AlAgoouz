import { logger } from '../services/loggerService.ts';
import { AppError } from '../types/errors.ts';
import config from '../config/index.ts';
/**
 * تصنيف أخطاء PostgreSQL (رموز pg) إلى AppError عربي واضح.
 * @param {any} err الخطأ الخام
 * @returns {import('../types/errors.ts').AppError | null} الخطأ المُصنَّف أو null إن لم يكن معروفًا
 */
const classifyDbError = (err) => {
  if (err.code === '23505') {
    const col = err.detail?.match(/Key \((.+?)\)/)?.[1] || 'الحقل';
    return new AppError(`القيمة مكررة في: ${col}`, 409, 'DUPLICATE_KEY');
  }
  if (err.code === '23503') {
    return new AppError(
      'لا يمكن الحذف: يوجد بيانات مرتبطة بهذا السجل',
      409,
      'FOREIGN_KEY_VIOLATION',
    );
  }
  if (err.code === '23502') {
    const col = err.column || 'حقل مطلوب';
    return new AppError(`${col} مطلوب ولا يمكن أن يكون فارغاً`, 400, 'NOT_NULL_VIOLATION');
  }
  if (err.code === '57014') {
    return new AppError('انتهت مهلة العملية — الاستعلام استغرق وقتاً طويلاً', 504, 'QUERY_TIMEOUT');
  }
  if (['ECONNREFUSED', 'ENOTFOUND', '08003', '08006', '08001', '08004'].includes(err.code)) {
    return new AppError('قاعدة البيانات غير متاحة — تحقق من الاتصال', 503, 'DB_UNAVAILABLE');
  }
  if (err.code === '23514') {
    return new AppError('القيمة المدخلة غير مسموح بها', 400, 'CHECK_VIOLATION');
  }
  return null;
};
/**
 * معالج المسارات غير الموجودة (404).
 * @param {import('express').Request} req طلب HTTP
 * @param {import('express').Response} res استجابة HTTP
 * @param {import('express').NextFunction} next تمرير الخطأ
 */
const notFound = (req, res, next) => {
  next(new AppError(`الصفحة غير موجودة: ${req.originalUrl}`, 404, 'NOT_FOUND'));
};
/**
 * معالج الأخطاء المركزي: تصنيف، تسجيل، واستجابة JSON موحدة.
 * @param {any} err الخطأ
 * @param {import('express').Request} req طلب HTTP
 * @param {import('express').Response} res استجابة HTTP
 * @param {import('express').NextFunction} _next تمرير الخطأ
 */
const errorHandler = (err, req, res, _next) => {
  const classified = classifyDbError(err);
  const finalErr = classified || err;
  const statusCode = finalErr.statusCode || (classified ? 500 : err.statusCode || 500);
  const isAppError = !classified && finalErr instanceof AppError;
  // رسالة عامة للأخطاء الداخلية غير المصنفة — منع تسريب تفاصيل قاعدة البيانات/المكتبات للعميل
  const GENERIC_MESSAGE = 'حدث خطأ غير متوقع — حاول مرة أخرى أو تواصل مع الدعم الفني';
  const knownError = isAppError || !!classified;
  const isClientError = statusCode >= 400 && statusCode < 500;
  const message =
    knownError || isClientError ? finalErr.message || 'طلب غير صالح' : GENERIC_MESSAGE;
  const code = knownError || isClientError ? finalErr.code || 'REQUEST_ERROR' : 'INTERNAL_ERROR';
  const requestId = req.requestId || 'N/A';
  const userId = req.user?.id;
  if (statusCode >= 500) {
    logger.error({
      message: `[${requestId}] Internal Error: ${finalErr.message || message}`,
      requestId,
      path: req.path,
      method: req.method,
      userId,
      stack: err.stack,
      pgCode: err.code,
      // PostgreSQL error code إن وجد
    });
  } else if (statusCode >= 400) {
    logger.warn({
      message: `[${requestId}] Client Error (${statusCode}): ${message}`,
      requestId,
      path: req.path,
      method: req.method,
      userId,
    });
  }
  res.status(statusCode).json({
    success: false,
    message,
    code,
    requestId,
    // تفاصيل إضافية في بيئة التطوير فقط
    ...(config.isDevelopment && err.stack
      ? { stack: err.stack, pgCode: err.code, rawMessage: finalErr.message }
      : {}),
  });
};
export { errorHandler, notFound };
