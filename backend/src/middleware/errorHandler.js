import { logger } from '../services/loggerService.js';

export class AppError extends Error {
  constructor(message, statusCode = 400, code = 'APP_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
  }
}

export const notFound = (req, res, next) => {
  next(new AppError(`الصفحة غير موجودة: ${req.originalUrl}`, 404, 'NOT_FOUND'));
};

export const errorHandler = (err, req, res, _next) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'حدث خطأ غير متوقع';

  // Log error using Winston
  if (statusCode >= 500) {
    logger.error('Internal Server Error: %s', err.stack || err);
  } else {
    logger.warn('Client Error (%d): %s', statusCode, message);
  }

  res.status(statusCode).json({
    success: false,
    message,
    code: err.code || 'INTERNAL_ERROR',
    ...(process.env.NODE_ENV !== 'production' && err.stack ? { stack: err.stack } : {}),
  });
};
