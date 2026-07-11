import { AppError } from './errorHandler.js';

export const validate = (schema) => (req, res, next) => {
  try {
    const data = { ...req.body, ...req.params, ...req.query };
    const parsed = schema.parse(data);
    req.validated = parsed;
    next();
  } catch (err) {
    const message = err.errors?.map((e) => `${e.path.join('.')}: ${e.message}`).join(' | ') || 'بيانات غير صالحة';
    next(new AppError(message, 400, 'VALIDATION_ERROR'));
  }
};

export const validateBody = (schema) => (req, res, next) => {
  try {
    req.body = schema.parse(req.body);
    next();
  } catch (err) {
    const message = err.errors?.map((e) => `${e.path.join('.')}: ${e.message}`).join(' | ') || 'بيانات غير صالحة';
    next(new AppError(message, 400, 'VALIDATION_ERROR'));
  }
};

export const validateQuery = (schema) => (req, res, next) => {
  try {
    req.query = schema.parse(req.query);
    next();
  } catch (err) {
    const message = err.errors?.map((e) => `${e.path.join('.')}: ${e.message}`).join(' | ') || 'بيانات غير صالحة';
    next(new AppError(message, 400, 'VALIDATION_ERROR'));
  }
};
