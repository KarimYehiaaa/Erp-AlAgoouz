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

  if (process.env.NODE_ENV !== 'production') {
    console.error(err);
  }

  res.status(statusCode).json({
    success: false,
    message,
    code: err.code || 'INTERNAL_ERROR',
    ...(process.env.NODE_ENV !== 'production' && err.stack ? { stack: err.stack } : {}),
  });
};
