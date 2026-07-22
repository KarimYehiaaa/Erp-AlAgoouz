import { logger } from '../services/loggerService.js';

/**
 * خطأ تشغيلي موثوق — يُرسل مباشرة للعميل
 */
export class AppError extends Error {
  constructor(message, statusCode = 400, code = 'APP_ERROR') {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
  }
}

/**
 * تصنيف أخطاء PostgreSQL إلى رسائل مفهومة بالعربية
 */
const classifyDbError = (err) => {
  // Unique Constraint Violation
  if (err.code === '23505') {
    const col = err.detail?.match(/Key \((.+?)\)/)?.[1] || 'الحقل';
    return new AppError(`القيمة مكررة في: ${col}`, 409, 'DUPLICATE_KEY');
  }
  // Foreign Key Violation
  if (err.code === '23503') {
    return new AppError('لا يمكن الحذف: يوجد بيانات مرتبطة', 409, 'FOREIGN_KEY_VIOLATION');
  }
  // Not Null Violation
  if (err.code === '23502') {
    const col = err.column || 'حقل مطلوب';
    return new AppError(`${col} مطلوب ولا يمكن أن يكون فارغاً`, 400, 'NOT_NULL_VIOLATION');
  }
  // Statement Timeout
  if (err.code === '57014') {
    return new AppError('انتهت مهلة العملية — الاستعلام استغرق وقتاً طويلاً', 504, 'QUERY_TIMEOUT');
  }
  // Connection Refused / Pool Timeout
  if (['ECONNREFUSED', 'ENOTFOUND', '08003', '08006', '08001', '08004'].includes(err.code)) {
    return new AppError('قاعدة البيانات غير متاحة — تحقق من الاتصال', 503, 'DB_UNAVAILABLE');
  }
  // Check Constraint
  if (err.code === '23514') {
    return new AppError('القيمة المدخلة غير مسموح بها', 400, 'CHECK_VIOLATION');
  }
  return null;
};

/**
 * Middleware: 404 Not Found
 */
export const notFound = (req, res, next) => {
  next(new AppError(`الصفحة غير موجودة: ${req.originalUrl}`, 404, 'NOT_FOUND'));
};

/**
 * Middleware: Global Error Handler
 * يُعالج جميع الأخطاء ويُرسل استجابة موحدة للعميل
 */
export const errorHandler = (err, req, res, _next) => {
  // محاولة تصنيف خطأ قاعدة البيانات أولاً
  const classified = classifyDbError(err);
  const finalErr = classified || err;

  const statusCode = finalErr.statusCode || 500;
  const message = finalErr.message || 'حدث خطأ غير متوقع';
  const code = finalErr.code || 'INTERNAL_ERROR';
  const requestId = req.requestId || 'N/A';

  // تسجيل الخطأ مع Request ID للتتبع
  if (statusCode >= 500) {
    logger.error({
      message: `[${requestId}] Internal Error: ${message}`,
      requestId,
      path: req.path,
      method: req.method,
      userId: req.user?.id,
      stack: err.stack,
      pgCode: err.code,       // PostgreSQL error code إن وجد
    });
  } else if (statusCode >= 400) {
    logger.warn({
      message: `[${requestId}] Client Error (${statusCode}): ${message}`,
      requestId,
      path: req.path,
      method: req.method,
      userId: req.user?.id,
    });
  }

  res.status(statusCode).json({
    success: false,
    message,
    code,
    requestId,
    // تفاصيل إضافية في بيئة التطوير فقط
    ...(process.env.NODE_ENV !== 'production' && err.stack
      ? { stack: err.stack, pgCode: err.code }
      : {}),
  });
};
