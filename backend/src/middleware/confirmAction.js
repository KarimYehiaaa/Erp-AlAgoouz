import { AppError } from './errorHandler.js';

const readConfirmation = (req) =>
  req.body?.confirm ||
  req.query?.confirm ||
  req.get('x-confirm-action');

export const requireConfirmation = (expectedToken, message = 'Action confirmation is required') => (req, _res, next) => {
  if (readConfirmation(req) !== expectedToken) {
    return next(new AppError(message, 400, 'CONFIRMATION_REQUIRED'));
  }

  return next();
};
