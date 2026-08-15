import { AppError } from '../types/errors.ts';

/**
 * قراءة رمز التأكيد من body أو query أو رأس x-confirm-action.
 * @param {import('express').Request} req طلب HTTP
 * @returns {string | undefined} رمز التأكيد
 */
const readConfirmation = (req) =>
  req.body?.confirm || req.query?.confirm || req.get('x-confirm-action');

/**
 * Middleware يتطلب رمز تأكيد صريحًا قبل تنفيذ عمليات حساسة.
 * @param {string} expectedToken رمز التأكيد المتوقع
 * @param {string} [message] رسالة الخطأ عند غياب أو خطأ الرمز
 * @returns {import('express').RequestHandler} middleware التأكيد
 */
export const requireConfirmation =
  (expectedToken, message = 'Action confirmation is required') =>
  (req, _res, next) => {
    if (readConfirmation(req) !== expectedToken) {
      return next(new AppError(message, 400, 'CONFIRMATION_REQUIRED'));
    }

    return next();
  };
