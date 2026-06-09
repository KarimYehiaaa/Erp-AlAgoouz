import { AppError } from './errorHandler.js';

export const validate = (schema) => (req, res, next) => {
  try {
    const data = { ...req.body, ...req.params, ...req.query };
    const parsed = schema.parse(data);
    req.validated = parsed;
    next();
  } catch (err) {
    const message = err.errors?.map((e) => `${e.path.join('.')}: ${e.message}`).join(' ') || '(J'F'* :J1 5'D-)';
    next(new AppError(message, 400, 'VALIDATION_ERROR'));
  }
};
