import { AppError } from '../types/errors.ts';
/**
 * تحقق موحد من (body + params + query) معًا وحفظ النتيجة في req.validated.
 * @param {import('zod').ZodTypeAny} schema مخطط Zod للتحقق
 * @returns {import('express').RequestHandler} middleware التحقق
 */
const validate = (schema) => (req, res, next) => {
  try {
    // حماية من Prototype Pollution باستخدام Object.create(null)
    const data = Object.assign(Object.create(null), req.body, req.params, req.query);
    const parsed = schema.parse(data);
    req.validated = parsed;
    next();
  } catch (err: any) {
    const message =
      err.errors?.map((e) => `${e.path.join('.')}: ${e.message}`).join(' | ') ||
      '\u0628\u064A\u0627\u0646\u0627\u062A \u063A\u064A\u0631 \u0635\u0627\u0644\u062D\u0629';
    next(new AppError(message, 400, 'VALIDATION_ERROR'));
  }
};
/**
 * تحقق من req.body فقط واستبداله بالقيمة المُحلَّلة.
 * @param {import('zod').ZodTypeAny} schema مخطط Zod للتحقق
 * @returns {import('express').RequestHandler} middleware التحقق
 */
const validateBody = (schema) => (req, res, next) => {
  try {
    req.body = schema.parse(req.body);
    next();
  } catch (err: any) {
    const message =
      err.errors?.map((e) => `${e.path.join('.')}: ${e.message}`).join(' | ') ||
      '\u0628\u064A\u0627\u0646\u0627\u062A \u063A\u064A\u0631 \u0635\u0627\u0644\u062D\u0629';
    next(new AppError(message, 400, 'VALIDATION_ERROR'));
  }
};
/**
 * تحقق من req.query فقط واستبداله بالقيمة المُحلَّلة (تظليل آمن متوافق مع Express 5).
 * @param {import('zod').ZodTypeAny} schema مخطط Zod للتحقق
 * @returns {import('express').RequestHandler} middleware التحقق
 */
const validateQuery = (schema) => (req, res, next) => {
  try {
    const parsed = schema.parse(req.query);
    // Express 5: req.query became a read-only getter that re-parses on every
    // access, so direct assignment no longer works. Shadow it on the request
    // instance with the validated/coerced object instead.
    Object.defineProperty(req, 'query', {
      configurable: true,
      enumerable: true,
      writable: true,
      value: parsed,
    });
    next();
  } catch (err: any) {
    const message =
      err.errors?.map((e) => `${e.path.join('.')}: ${e.message}`).join(' | ') ||
      '\u0628\u064A\u0627\u0646\u0627\u062A \u063A\u064A\u0631 \u0635\u0627\u0644\u062D\u0629';
    next(new AppError(message, 400, 'VALIDATION_ERROR'));
  }
};
export { validate, validateBody, validateQuery };
