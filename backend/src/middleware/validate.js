import { AppError } from "../types/errors.js";
const validate = (schema) => (req, res, next) => {
  try {
    // حماية من Prototype Pollution باستخدام Object.create(null)
    const data = Object.assign(Object.create(null), req.body, req.params, req.query);
    const parsed = schema.parse(data);
    req.validated = parsed;
    next();
  } catch (err) {
    const message = err.errors?.map((e) => `${e.path.join(".")}: ${e.message}`).join(" | ") || "\u0628\u064A\u0627\u0646\u0627\u062A \u063A\u064A\u0631 \u0635\u0627\u0644\u062D\u0629";
    next(new AppError(message, 400, "VALIDATION_ERROR"));
  }
};
const validateBody = (schema) => (req, res, next) => {
  try {
    req.body = schema.parse(req.body);
    next();
  } catch (err) {
    const message = err.errors?.map((e) => `${e.path.join(".")}: ${e.message}`).join(" | ") || "\u0628\u064A\u0627\u0646\u0627\u062A \u063A\u064A\u0631 \u0635\u0627\u0644\u062D\u0629";
    next(new AppError(message, 400, "VALIDATION_ERROR"));
  }
};
const validateQuery = (schema) => (req, res, next) => {
  try {
    req.query = schema.parse(req.query);
    next();
  } catch (err) {
    const message = err.errors?.map((e) => `${e.path.join(".")}: ${e.message}`).join(" | ") || "\u0628\u064A\u0627\u0646\u0627\u062A \u063A\u064A\u0631 \u0635\u0627\u0644\u062D\u0629";
    next(new AppError(message, 400, "VALIDATION_ERROR"));
  }
};
export {
  validate,
  validateBody,
  validateQuery
};
